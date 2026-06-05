# Plan 03: Stateless architecture and project import UI

**Status: Implemented.**

## Goal

Remove `video_dir` as a required CLI argument. The server starts with just `--port`. All project state is managed through the browser using the File System Access API, with a single human-readable `config.json` as the persistent record.

---

## Storage model

| Layer | Contents | Portable? |
|-------|----------|-----------|
| **IndexedDB** | `FileSystemFileHandle` for config.json; one `FileSystemDirectoryHandle` per footage folder | No — browser-local |
| **config.json** | Folder IDB keys + metadata; video entries with file names and hashes; all UI state | Yes |

GPS data is never written to config.json. SRT files are re-read and re-parsed (in JavaScript, client-side) on every load via their folder handle. The parsed track data is posted to the server each session via `POST /api/tracks`.

### Internal identity

Each video entry is identified internally by a `pairId` — a SHA-256 derived from the combination of both hashes:

```
pairId = sha256(videoHash + srtHash)
```

where `videoHash` = SHA-256 of the first 4 MB of the `.MOV` file, and `srtHash` = SHA-256 of the full SRT file. Both are computed at import time via the Web Crypto API. The combined hash means the pair is only considered the same if both files match, preventing false-positive adoption when only one file of a pair happens to match. `pairId` is used as the IDB key and for orphan-matching when new folders are added.

`displayName` is the human-readable label shown everywhere in the UI. It is user-editable, not enforced unique, and is used as the key in all config maps (`videoRotations`, `hiddenTracks`, etc.). Uniqueness is the user's responsibility; `pairId` is the ground truth for file identity.

### config.json shape

```json
{
  "folders": [
    { "name": "june-survey",   "idbKey": "folder-abc", "editorDisplayed": true  },
    { "name": "august-field",  "idbKey": "folder-def", "editorDisplayed": true  },
    { "name": "old-footage",   "idbKey": "folder-ghi", "editorDisplayed": false }
  ],
  "videos": [
    {
      "displayName":  "June Pass 1",
      "folderIdbKey": "folder-abc",
      "videoFile":    "DJI_0316.MOV",
      "srtFile":      "DJI_0316.SRT",
      "videoHash":    "<sha256-of-first-4mb>",
      "srtHash":      "<sha256-full>"
    }
  ],
  "mapRotation": 90,
  "hiddenTracks": ["June Pass 1"],
  "videoRotations":       { "June Pass 1": 90 },
  "compassBaseRotations": { "June Pass 1": 90 },
  "colorOverrides":       { "June Pass 1": "#ff6347" },
  "syncRotation": false,
  "dsN": 6,
  "viewport": { "minLat": 38.90, "maxLat": 38.92, "minLon": -92.29, "maxLon": -92.27 },
  "activeTrack": "June Pass 1",
  "activeTimestamp": 142.5
}
```

`editorDisplayed` controls whether a folder's clips appear in the footage editor file list — it is a UI filter, not a map visibility setting. Per-clip map visibility is controlled via `hiddenTracks` as before.

---

## Video playback: blob URLs

`URL.createObjectURL(await folderHandle.getFile(videoFile))` creates an opaque reference to the file on disk. The browser's media engine reads lazily in chunks — the file is never loaded into memory in full. Seeking works because the browser reads byte ranges from the `File` object on demand, equivalent to HTTP Range streaming. No server involvement in video playback.

`GET /video/<filename>` is removed from the server entirely.

---

## Server changes

The server becomes very thin:

- `video_dir` positional argument removed; `--config` flag removed
- `GET /api/config`, `POST /api/config` removed (FE writes config.json directly via its `FileSystemFileHandle`)
- `GET /video/<filename>` removed
- `GET /api/tracks` remains; now returns whatever was last posted
- `POST /api/tracks` added — FE posts parsed track data after reading and parsing SRTs client-side; server holds this in memory for the session

SRT parsing moves to the frontend (JavaScript reimplementation of the current Python `parse_srt()` logic, same DJI format with the `longtitude` typo).

---

## Resolve states

Each video entry in config.json has one of four resolve states, determined at load time:

| State | SRT | Video | Map behaviour | Video player |
|-------|-----|-------|---------------|--------------|
| **Full** | ✓ | ✓ | GPS track + drone icon | Normal |
| **GPS only** | ✓ | ✗ | GPS track + drone icon | "No video linked" |
| **Error** | ✗ | ✓ | Not shown | Not shown |
| **Orphaned** | ✗ | ✗ | Not shown | Not shown |

"SRT ✓" means the folder handle is resolved and the SRT file exists within it. "Video ✓" means the same for the `.MOV` file.

Only entries with SRT ✓ appear in the legend and on the map.

---

## FE startup logic

```
Load page
  → Check IndexedDB for config file handle
      → Not found: show Welcome screen
      → Found: requestPermission() for config file
          → Denied: show "Re-open config file" prompt
          → Granted: read config
              → For each folder: look up IDB handle, requestPermission()
                  → Resolved: read directory, check files exist, compute SRT parse
                  → Not resolved: mark all that folder's clips as orphaned
              → Post parsed tracks to server
              → Render map (GPS-only and full clips shown; errors/orphans excluded)
```

All folder resolutions run in parallel. The map renders as soon as any tracks are ready.

---

## Welcome screen

Shown on first launch (no config handle in IDB):

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                  drone-map                          │
│                                                     │
│              [ + New project ]                      │
│              [ ↗ Open project ]                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## New project flow

1. `showSaveFilePicker({ suggestedName: 'project.json', types: [{accept: {'application/json': ['.json']}}] })`
2. Config handle stored in IDB
3. Footage editor screen shown (new project mode — no "Cancel" exits to welcome screen)
4. On **Cancel**: IDB handle removed; empty config file deleted via the handle; welcome screen shown

---

## Open project flow

1. `showOpenFilePicker({ types: [{accept: {'application/json': ['.json']}}] })`
2. Config handle stored in IDB; config read and parsed
3. Folder handles resolved in parallel (see startup logic)
4. Map renders; footage editor accessible from legend button

---

## Footage editor screen

Single screen used for both new project setup and mid-session footage management. Accessed via **[ Manage footage ]** button in the legend.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Manage footage                              [ + Add folder ]│
├── Folders ──────────────────────────────────────────────────┤
│  ☑  june-survey/      ✓           [ Remove ]               │
│  ☑  august-field/     ✓           [ Remove ]               │
│     old-footage/      ⚠ unresolved  [ Link ] [ Remove ]    │
├── Files ────────────────────────────────────────────────────┤
│                                                             │
│  ☑  June Pass 1      june-survey/DJI_0316  ✓ ✓  [ Rename ]│
│  ☑  June Pass 2      june-survey/DJI_0317  ✓ ⚠  [ Rename ]│
│  ☑  August Survey    august-field/DJI_0318 ✓ ✓  [ Rename ]│
│                                                             │
│  ─── Orphaned ──────────────────────────────────────────── │
│  ☑  DJI_0320         old-footage/          ? ?  [ Rename ] │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [ Cancel ]                           [ Confirm (4 clips) ] │
└─────────────────────────────────────────────────────────────┘
```

### Folder section

- Each row: `editorDisplayed` checkbox · folder name · resolve status · `[ Link ]` (if unresolved) · `[ Remove ]`
- **Checkbox (editorDisplayed)**: filters that folder's clips out of the Files list below. Persisted to config. Does not affect the map.
- **Link**: opens `showDirectoryPicker()`; FE re-scans the new directory; clips whose `videoHash` or `srtHash` match are adopted (their `folderIdbKey` updated); remaining orphans stay
- **Remove**: if the folder has clips in the project, confirms "Remove N clips from this folder?" before proceeding. Orphaned clips whose folder is removed trigger the same dialog.
- **[ + Add folder ]**: `showDirectoryPicker()` → FE reads directory flat (no recursion) → scans for `.MOV`/`.SRT` files → auto-pairs by stem name → adds new pair rows to the Files list, pre-checked. Also attempts to adopt any orphaned clips by hash.

### Files section

- Flat list, lexicographic order by `displayName`, across all folders
- Only clips from `editorDisplayed` folders are shown (others filtered out)
- Orphaned clips (all files unresolved) appear at the bottom under a separator regardless of filter
- Each row: checkbox · `displayName` · `folder/filename` path hint · SRT status icon · video status icon · `[ Rename ]`
- **Checkbox**: checked = in project, unchecked = removed from config. Unchecking an orphaned clip triggers a confirmation dialog ("Remove DJI_0320 from project? This cannot be undone.")
- Status icons: ✓ resolved · ⚠ missing · ? orphaned (folder unresolved)
- **Rename**: inline — clicking it makes `displayName` an editable text field; Enter or blur confirms. No uniqueness enforcement.

### Confirm / Cancel

- **Confirm**: writes config.json (adds new clips, removes unchecked clips, updates displayNames and folder state), re-parses any new SRTs, re-posts tracks to server, returns to map
- **Cancel**:
  - New project mode: removes IDB handle, deletes empty config file, returns to welcome screen
  - Existing project mode: discards all pending changes, returns to map

---

## Legend changes

The legend shows only clips in **Full** or **GPS only** resolve state (SRT resolved). Each item is the clip's `displayName`.

A **[ Manage footage ]** button is added at the bottom of the legend, always visible, opens the footage editor screen.

---

## Sharing a project

config.json alone is the shareable artifact. The collaborator opens it via "Open project", finds all handles broken (new machine), and uses the footage editor to add their local copy of the footage folder. Hash matching auto-adopts all clips; they rename any that were customised if needed.

For path hints to assist with finding files, see `collaboration.md`.
