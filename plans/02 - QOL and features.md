# Plan 02: QOL and features

## Package structure

```
drone-map.py              ← uv shim (# /// script header)
drone_map/
    __init__.py
    parser.py             ← parse_srt(), build_tracks(), generate_colors(n)
    server.py             ← Flask app, 3 routes only (GET /, GET/POST /api/tracks)
    cli.py                ← argument parsing, startup
    static/               ← 14 ES modules (no build step)
        state.js          ← shared mutable state + CARDINALS
        dom.js            ← shared DOM element refs (canvas, ctx, videoEl, btnSave)
        utils.js          ← pure utilities + generateColors(n)
        projection.js     ← project(), unproject()
        render.js         ← render(), draw* helpers
        video.js          ← loadVideoAt (async, blob URLs), rotateVideo, updateCompassLabels, rAF loop
        config.js         ← saveConfig/loadConfig via FileSystemFileHandle, applyConfig, markDirty
        history.js        ← pushHistory, back/forward navigation
        interactions.js   ← canvas mouse events, box-zoom, pan, scroll
        idb.js            ← IndexedDB helpers: idbGet/Set/Delete/PushRecent/GetRecent
        srt-parser.js     ← JS port of parser.py (same DJI format, same longtitude typo)
        project.js        ← loadProject(), resolvePair(), scanFolder(), hashPair(), registerFolder()
        editor.js         ← footage editor UI: folder list, file list, rename, confirm/cancel
        app.js            ← three-screen init, legend, toolbar wiring, routing
    style.css
    templates/
        index.html        ← three screens: #welcomeScreen, #editorScreen, #appScreen
```

---

## Smarter playback time lookup

- **`seekPointByTime(track, t)`** — binary search; resets `lastPtIdx`; used on `loadVideoAt` and `seeking`
- **`advancePointByTime(track, t)`** — linear forward scan from `lastPtIdx`; O(1) amortised; falls back to seek if time jumped backwards

`lastPtIdx` is reset to 0 on every track switch. Drone bearing (`travelAngle`) uses `lastPtIdx` directly.

---

## Per-video rotation correction

CSS `transform: rotate()` — GPU-accelerated, zero CPU overhead.

```javascript
videoRotations: Map<trackName, 0|90|180|270>
```

Scale correction for 90°/270°: computed from panel and video dimensions after `loadedmetadata`; recomputed on resize.

Two buttons in the video panel header:
```
[↶ -90°]  [↷ +90°]
```

---

## Config persistence

### CLI

```
uv run drone-map.py [--port 5001] [--open-browser[=true|false]]
```

`--port` defaults to 5001. No `--config` flag — all file I/O is handled in-browser via the File System Access API.

`--open-browser` uses `nargs='?'` with `const=True`:
- `--open-browser` or `--open-browser=true` → open browser
- `--open-browser=false` → do not open
- Omitted → interactive `Open browser? [y/N]` prompt

### Config JSON structure

```json
{
  "mapRotation": 90,
  "hiddenTracks": ["DJI_0317"],
  "videoRotations":       { "DJI_0316": 90 },
  "compassBaseRotations": { "DJI_0316": 90 },
  "colorOverrides":       { "DJI_0316": "#ff6347" },
  "syncRotation": false,
  "dsN": 6,
  "viewport": { "minLat": 38.90, "maxLat": 38.92, "minLon": -92.29, "maxLon": -92.27 },
  "activeTrack": "DJI_0316",
  "activeTimestamp": 142.5
}
```

### Server routes

| Route | Purpose |
|-------|---------|
| `GET /` | Serve `index.html` |
| `GET /api/tracks` | Return tracks posted by the FE this session |
| `POST /api/tracks` | FE posts parsed track data after loading; server holds in memory |

Config I/O, video playback, and SRT parsing all happen entirely in the browser. The server has no knowledge of file paths.

`markDirty()` called from every state-mutation site. Save button gets amber border when dirty. `beforeunload` warns on unsaved changes.

---

## Color palette

Fixed COLORS list replaced with an HSL generator:

```python
def generate_colors(n: int) -> list[str]:
    return [f'hsl({int(360 * i / n)}, 72%, 58%)' for i in range(n)]
```

Colors are spread evenly around the hue wheel, all distinct for any n. `build_tracks()` calls this once with the final pair count.

---

## Click-to-change color swatches

Each legend swatch is a `div` containing a hidden `<input type="color">`. Clicking the swatch (not the name) opens the system color picker. On selection:

1. `track.color` updated in-place (render picks it up immediately)
2. `state.colorOverrides.set(trackName, hex)` persisted to config

Clicking the track name still toggles map visibility (`.hidden-track` class, opacity 0.38 + strikethrough).

---

## Video compass overlay and map/video sync

### Compass labels

N/S/E/W labels overlaid on `#videoWrapper` (`z-index: 5`, `pointer-events: none`).

**State:** `compassBaseRotations: Map<trackName, deg>`

**Label formula:** `effectiveRot = (compassBase - videoRot + 360) % 360` → CARDINALS table lookup.

**Uncalibrated state:** when a track has no entry in `compassBaseRotations`, all four labels show `?`.

### "Match map" button

Sets the compass overlay to match the map's current top direction (map is the source of truth):

```javascript
compassBase = (mapRotation + videoRotation) % 360
```

Derivation: pressing should make `effectiveRot = mapRotation`. Solving: `compassBase = (mapRotation + videoRotation) % 360`.

### Sync rotations checkbox

`syncRotation: boolean` — when active, rotating the map also rotates the active video (and vice versa). Implemented as a checkbox (`<input type="checkbox" id="chkSyncRotation">`) rather than a toggle button, so state is always visually clear.

**Disabled when uncalibrated:** the checkbox is grayed out (`disabled`) when the active track has no compass entry. The underlying `state.syncRotation` value is preserved; the checkbox re-enables on switching to a calibrated track.

**Sign convention (important):**
- `state.rotation += 90` is a **visually CCW** rotation (East comes to top — see `projection.js` case 90).
- ↺ (CCW) button maps to `rotateMap(+90)`, ↷ (CW) button maps to `rotateMap(-90)`.
- Sync uses **opposite-sign delta**: `rotateMap(+90)` applies `-90` to `videoRotations`. This keeps nadir footage aligned with the map (map CCW + video CW = same ground orientation in both views), and keeps compass labels tracking the map correctly after "Match map".

---

## Python test suite

30 tests across `tests/test_cli.py`, `tests/test_parser.py`, `tests/test_server.py`. 99% coverage (one unreachable defensive branch in the streaming generator).

```
uv run --with pytest --with flask --with pytest-cov pytest tests/ -v
```

---

## Stateless architecture

See plan 03 for the full design. Implemented: File System Access API for config + folder handles, IndexedDB for handle persistence across sessions, SHA-256 pairId for orphan resolution, three-screen flow (welcome → editor → app), blob URLs for video playback.

## Recent projects and navigation

Recent projects (up to 5) stored in IDB under key `'recent'` as `[{name, handle}]`. Deduplicated on push via `isSameEntry()`. Welcome screen shows the list; clicking an entry re-requests permission and loads the project.

Navigation: `⌂` button in the toolbar closes the project (unsaved-changes guard), clears state, and returns to the welcome screen. Browser back button is wired via `history.pushState` — entering the app pushes `{screen:'app'}`, and popping to welcome triggers `closeProject()`.
