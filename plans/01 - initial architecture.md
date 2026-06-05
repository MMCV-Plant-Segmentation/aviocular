# Plan: drone-map — GPS route viewer + video player

## Overview

Single-file CLI tool: `uv run drone-map.py <path>`.  
Opens a browser at `http://localhost:5001` showing a coordinate-plane map of all GPS routes with a linked video player.

---

## File structure

```
drone-map.py          ← CLI entry point + Flask server (only file to run)
plans/01.md           ← this file
vids/                 ← input: *.MOV + *.SRT pairs
```

The server embeds all HTML/JS/CSS as Python template strings so the tool is fully self-contained.

---

## Inline uv dependencies

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["flask"]
# ///
```

Run with: `uv run drone-map.py ./vids/`

---

## Server (`drone-map.py`)

### SRT parsing

Each DJI SRT entry (6 lines) looks like:
```
1
00:00:00,033 --> 00:00:00,066
<font size="36">FrameCnt : 2, DiffTime : 33ms
2026-06-03 10:58:51,...
[latitude : 38.904583] [longtitude : -92.282375] [altitude: 254.49] </font>

```

- Regex extracts `latitude`, `longtitude` (DJI's typo), and start timestamp per frame
- All points (~30fps, ~39k total across 6 videos) are sent to the frontend as `[[t, lat, lon], ...]`
- **Downsampling is done on the frontend**, not here — server sends full data
- Each video gets a default color from a 6-color palette; color is included in the JSON so it's ready for future UI color-picking

### Flask routes

| Route | Purpose |
|-------|---------|
| `GET /` | HTML page |
| `GET /api/tracks` | JSON: all tracks (name, file, color, full points array) |
| `GET /video/<file>` | Video stream with HTTP Range support (streaming, never loads multi-GB into memory) |

### HTTP Range streaming

Manual implementation using a generator:
```python
def video_stream(path, byte1, byte2, chunk=65536):
    with open(path, 'rb') as f:
        f.seek(byte1)
        remaining = byte2 - byte1 + 1
        while remaining > 0:
            data = f.read(min(chunk, remaining))
            if not data: break
            remaining -= len(data)
            yield data
```

Responds with 206 Partial Content when a `Range:` header is present (required for video seeking in browsers). Codec is H.264/AVC (`avc1`) confirmed — plays natively in all browsers without transcoding.

### Startup

- Parses all SRT files in the given directory (paired by stem name with `.MOV`)
- Assigns colors from palette
- Prints `Serving at http://localhost:5001`
- Opens browser with `webbrowser.open()`
- Runs Flask on port 5001

---

## Frontend

### Layout

```
┌─ Toolbar (full width) ───────────────────────────────────────────────────────┐
│  [← Back]  [Forward →]  │  [⊡ Box Zoom]  [↻ Rotate]  [⊞ Grid]  │  Legend   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                       │                                       │
│           MAP CANVAS  (60%)           │        VIDEO PLAYER  (40%)           │
│                                       │                                       │
│                                       │  [DJI_0316]  02:14 / 05:03          │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

Bottom-right of map: downsample control — `Show every [  6  ] frames` (scroll-to-change, triggers re-render).

### Map canvas

#### Coordinate system & projection

Viewport is always stored as `{minLat, maxLat, minLon, maxLon}`.  
Rotation is 0 / 90 / 180 / 270 degrees CW, stored as an integer.

```javascript
function project(lat, lon) {
  const east  = (lon - vp.minLon) / (vp.maxLon - vp.minLon);  // 0=W, 1=E
  const north = (lat - vp.minLat) / (vp.maxLat - vp.minLat);  // 0=S, 1=N
  switch (rotation) {
    case 0:   return { x: east*W,       y: (1-north)*H };
    case 90:  return { x: (1-north)*W,  y: (1-east)*H  };
    case 180: return { x: (1-east)*W,   y: north*H      };
    case 270: return { x: north*W,      y: east*H       };
  }
}

function unproject(px, py) {
  // inverse of the above; returns {lat, lon}
}
```

Gridlines are drawn by projecting endpoints `project(lat, minLon)→project(lat, maxLon)` per lat line and `project(minLat, lon)→project(maxLat, lon)` per lon line — the correct canvas edges fall out naturally from the rotation.

#### Cardinal direction labels

Lookup table keyed by rotation degree:
```
0°:   top=N  right=E  bottom=S  left=W
90°:  top=E  right=S  bottom=W  left=N
180°: top=S  right=W  bottom=N  left=E
270°: top=W  right=N  bottom=E  left=S
```

Labels are drawn at the center of each canvas edge (always visible, always correct).

#### Grid (toggleable)

- "Nice interval" algorithm picks lat/lon step sizes from standard {1, 2, 5} × 10^n sequence targeting ~5 lines per axis
- Grid lines drawn as thin gray lines with lat/lon values labeled at both ends
- Toggled by the [Grid] button; default on

#### Route rendering

- On every render, downsample each track: keep every Nth point (N = input value, default 6)
- Draw polyline per video in its assigned color
- Draw small dot at each displayed point

#### Hover / tooltip

- On `mousemove`: unproject cursor → find nearest displayed point within 20px (O(n) scan across all tracks)
- If found: draw highlighted dot, show floating tooltip: `[DJI_0316]  02:14.3  (38.9046°N, 92.2824°W)`

#### Click to seek

- On `mouseup` after no significant drag: same nearest-point lookup → load video at that timestamp (no autoplay)

#### Interactions

| Action | Behavior |
|--------|----------|
| Drag (default mode) | Pan viewport; push history on mouseup |
| Scroll wheel | Zoom centered on cursor; push history 300ms after last scroll event |
| Box Zoom mode + drag | Draw rectangle overlay; zoom to box on mouseup; push history |
| Click [Rotate] | Cycle rotation 0→90→180→270→0; re-render |
| Click [Grid] | Toggle grid visibility; re-render |

#### View history stack

```javascript
let viewHistory = [initialViewport];
let historyIdx  = 0;

function pushViewport(vp) {
  viewHistory = viewHistory.slice(0, historyIdx + 1);
  viewHistory.push({...vp});
  historyIdx = viewHistory.length - 1;
}
```

History is pushed on: pan mouseup (if moved), box-zoom mouseup, scroll-end (debounced 300ms).  
[← Back] / [Forward →] navigate the stack; buttons are disabled at the ends.

#### Downsample control

```html
Show every <input type="number" min="1" value="6" style="width:4em"> frames
```

- `wheel` event on the input increments/decrements by 1 (clamped to ≥ 1)
- `change` event triggers re-render (no server round-trip; all data already in memory)

### Video player

- HTML5 `<video>` element, no controls hidden — standard browser controls
- On point click: if `video.src` differs, update src then seek; else just seek
- Never auto-plays (`video.pause()` after seek)
- Displays filename and current timestamp above the player

### Legend

Small panel in toolbar (or floating on map):
- Color swatch + video name per track
- Structure is ready for a future color-picker input next to each swatch
- Click a legend item → highlight that route (future: toggle visibility)

---

## Data format (`/api/tracks` response)

```json
{
  "videos": [
    {
      "name": "DJI_0315",
      "file": "DJI_0315.MOV",
      "color": "#e74c3c",
      "points": [
        [0.000, 38.904583, -92.282375],
        [0.033, 38.904583, -92.282375],
        ...
      ]
    }
  ]
}
```

Points are `[t_seconds, lat, lon]` at full 30fps density (~39k total). Frontend applies the N-frame downsample.

---

## Color palette (default)

```javascript
['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c']
```

Color is stored per-track in the API response, so a future UI can `PATCH /api/tracks/:name/color` or just store overrides client-side without touching the server.

---

## Out of scope (phase 2)

- Adding labeled points to the map with save/load
- Per-video color picker UI
- Legend item visibility toggle
