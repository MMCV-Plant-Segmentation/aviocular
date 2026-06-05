import { state } from './state.js';
import { btnSave } from './dom.js';

export function markDirty() {
  state.isDirty = true;
  if (state.configHandle) btnSave.classList.add('dirty');
}

export async function saveConfig() {
  if (!state.configHandle) return;
  const payload = {
    folders: state.folders.map(f => ({
      idbKey:          f.idbKey,
      name:            f.name,
      editorDisplayed: f.editorDisplayed,
    })),
    videos: [...state.tracks, ...state.orphanedPairs].map(t => ({
      pairId:       t.pairId,
      displayName:  t.displayName,
      folderIdbKey: t.folderIdbKey,
      videoFile:    t.videoFile,
      srtFile:      t.srtFile,
      videoHash:    t.videoHash,
      srtHash:      t.srtHash,
    })),
    mapRotation:          state.rotation,
    hiddenTracks:         [...state.hiddenTracks],
    videoRotations:       Object.fromEntries(state.videoRotations),
    compassBaseRotations: Object.fromEntries(state.compassBaseRotations),
    colorOverrides:       Object.fromEntries(state.colorOverrides),
    syncRotation:         state.syncRotation,
    dsN:                  state.dsN,
    viewport:             state.viewport,
    activeTrack:          state.activeTrack?.name ?? null,
    activeTimestamp:      state.activePoint?.[0]  ?? null,
  };
  try {
    const writable = await state.configHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    state.isDirty = false;
    btnSave.classList.remove('dirty');
  } catch (e) {
    console.error('Save failed:', e);
  }
}

export async function loadConfig() {
  if (!state.configHandle) return {};
  try {
    const file = await state.configHandle.getFile();
    const text = await file.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export function applyConfig(cfg) {
  if (cfg.mapRotation !== undefined) state.rotation = cfg.mapRotation;
  if (cfg.dsN !== undefined) {
    state.dsN = cfg.dsN;
    document.getElementById('dsInput').value = state.dsN;
  }
  if (Array.isArray(cfg.hiddenTracks)) {
    cfg.hiddenTracks.forEach(n => state.hiddenTracks.add(n));
    document.querySelectorAll('.legend-item').forEach(el => {
      if (state.hiddenTracks.has(el.dataset.track)) el.classList.add('hidden-track');
    });
  }
  if (cfg.videoRotations)
    Object.entries(cfg.videoRotations).forEach(([n, d]) => state.videoRotations.set(n, d));
  if (cfg.compassBaseRotations)
    Object.entries(cfg.compassBaseRotations).forEach(([n, d]) => state.compassBaseRotations.set(n, d));
  if (cfg.colorOverrides) {
    Object.entries(cfg.colorOverrides).forEach(([name, color]) => {
      state.colorOverrides.set(name, color);
      const track = state.tracks.find(t => t.name === name);
      if (!track) return;
      track.color = color;
      const item = document.querySelector(`.legend-item[data-track="${CSS.escape(name)}"]`);
      if (!item) return;
      item.querySelector('.legend-swatch').style.background = color;
      const ci = item.querySelector('input[type=color]');
      if (ci) ci.value = color;
    });
  }
  if (cfg.syncRotation !== undefined) {
    state.syncRotation = cfg.syncRotation;
    document.getElementById('chkSyncRotation').checked = state.syncRotation;
  }
  if (cfg.viewport) state.viewport = cfg.viewport;
}
