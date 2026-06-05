export const CARDINALS = {
    0: { top: 'N', right: 'E', bottom: 'S', left: 'W' },
   90: { top: 'E', right: 'S', bottom: 'W', left: 'N' },
  180: { top: 'S', right: 'W', bottom: 'N', left: 'E' },
  270: { top: 'W', right: 'N', bottom: 'E', left: 'S' },
};

export const state = {
  // ── project ─────────────────────────────────────────────────────────────────
  configHandle:  null,   // FileSystemFileHandle for project.json
  folders:       [],     // [{idbKey, name, handle, editorDisplayed}]
  orphanedPairs: [],     // pairs whose folder handle is unresolved

  // ── map data ────────────────────────────────────────────────────────────────
  tracks:          [],
  viewport:        null,
  initialViewport: null,
  rotation:        0,    // 0 | 90 | 180 | 270  (state+90 = visual CCW)
  showGrid:        true,
  dsN:             6,
  boxZoom:         false,
  syncRotation:    false,

  hiddenTracks:         new Set(),
  videoRotations:       new Map(),   // trackName → 0 | 90 | 180 | 270
  compassBaseRotations: new Map(),   // trackName → deg
  colorOverrides:       new Map(),   // trackName → hex

  // ── playback ─────────────────────────────────────────────────────────────────
  activeTrack:    null,
  activePoint:    null,
  lastPtIdx:      0,
  animFrame:      null,
  activeBlobUrl:  null,  // current blob URL; revoked on track switch

  // ── history ──────────────────────────────────────────────────────────────────
  viewHistory: [],
  histIdx:     -1,

  // ── persistence ──────────────────────────────────────────────────────────────
  isDirty: false,

  // ── interaction ──────────────────────────────────────────────────────────────
  dragging:    false,
  dragStart:   null,
  dragLast:    null,
  boxStart:    null,
  didDrag:     false,
  scrollTimer: null,
};
