import { state } from './state.js';
import { canvas, videoEl, btnSave } from './dom.js';
import { render } from './render.js';
import { saveConfig, applyConfig, markDirty } from './config.js';
import { pushHistory, applyViewport, updateHistoryBtns } from './history.js';
import { loadVideoAt, updateCompassLabels, applyVideoRotation, rotateVideo,
         startTrackingLoop, syncFromVideo } from './video.js';
import { viewportFromTracks, generateColors } from './utils.js';
import { setupInteractions } from './interactions.js';
import { idbGet, idbSet, idbDelete, idbPushRecent, idbGetRecent } from './idb.js';
import { loadProject } from './project.js';
import { openEditor } from './editor.js';

// ── Screen management ─────────────────────────────────────────────────────────

function showScreen(name, { pushHistory: push = true } = {}) {
  document.getElementById('welcomeScreen').style.display = name === 'welcome' ? '' : 'none';
  document.getElementById('editorScreen').style.display  = name === 'editor'  ? '' : 'none';
  document.getElementById('appScreen').style.display     = name === 'app'     ? '' : 'none';
  // Editor is a transient overlay — don't pollute browser history with it
  if (push && name !== 'editor') history.pushState({ screen: name }, '', `#${name === 'welcome' ? '' : name}`);
}

async function closeProject() {
  if (state.isDirty) {
    if (!confirm('You have unsaved changes. Close project anyway?')) return;
  }
  if (state.animFrame) { cancelAnimationFrame(state.animFrame); state.animFrame = null; }
  if (state.activeBlobUrl) { URL.revokeObjectURL(state.activeBlobUrl); state.activeBlobUrl = null; }
  videoEl.src = '';
  await idbDelete('config');
  Object.assign(state, {
    configHandle: null, folders: [], tracks: [], orphanedPairs: [],
    viewport: null, initialViewport: null, rotation: 0, showGrid: true, dsN: 6,
    boxZoom: false, syncRotation: false,
    hiddenTracks: new Set(), videoRotations: new Map(),
    compassBaseRotations: new Map(), colorOverrides: new Map(),
    activeTrack: null, activePoint: null, lastPtIdx: 0,
    viewHistory: [], histIdx: -1, isDirty: false,
  });
  document.getElementById('legend').innerHTML = '';
  document.getElementById('dsInput').value = 6;
  document.getElementById('btnGrid').classList.add('active');
  showScreen('welcome');
  populateRecent();
}

// ── Map canvas ────────────────────────────────────────────────────────────────

function resizeCanvas() {
  const panel = document.getElementById('mapPanel');
  canvas.width  = panel.clientWidth;
  canvas.height = panel.clientHeight;
  render();
  applyVideoRotation();
}

// ── Legend ────────────────────────────────────────────────────────────────────

function buildLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '';

  for (const t of state.tracks) {
    const item = document.createElement('div');
    item.className     = 'legend-item';
    item.dataset.track = t.name;

    const swatch = document.createElement('div');
    swatch.className = 'legend-swatch';
    swatch.style.cssText += ';cursor:pointer';
    swatch.style.background = t.color;
    swatch.title = 'Click to change color';

    const colorInput = document.createElement('input');
    colorInput.type     = 'color';
    colorInput.style.cssText = 'position:absolute;width:0;height:0;opacity:0;padding:0;border:0;pointer-events:none';
    if (t.color.startsWith('#')) colorInput.value = t.color;
    swatch.appendChild(colorInput);
    swatch.addEventListener('click', e => { e.stopPropagation(); colorInput.click(); });
    colorInput.addEventListener('input', () => {
      t.color = colorInput.value;
      swatch.style.background = colorInput.value;
      state.colorOverrides.set(t.name, colorInput.value);
      render(); markDirty();
    });

    const nameEl = document.createElement('span');
    nameEl.textContent = t.name;
    nameEl.title = 'Click to show/hide';

    item.appendChild(swatch);
    item.appendChild(nameEl);
    legend.appendChild(item);

    item.addEventListener('click', () => {
      if (state.hiddenTracks.has(t.name)) state.hiddenTracks.delete(t.name);
      else state.hiddenTracks.add(t.name);
      item.classList.toggle('hidden-track', state.hiddenTracks.has(t.name));
      render(); markDirty();
    });
  }
}

// ── Project initialisation (called after tracks are ready) ────────────────────

async function initMap(cfg) {
  showScreen('app');  // show first so mapPanel has real dimensions for resizeCanvas
  buildLegend();
  setupInteractions();

  state.initialViewport = viewportFromTracks(state.tracks);
  if (!state.viewport) state.viewport = { ...state.initialViewport };
  resizeCanvas();
  pushHistory(state.viewport);
  render();
  updateCompassLabels();

  btnSave.disabled = !state.configHandle;

  if (cfg?.activeTrack && cfg?.activeTimestamp != null) {
    const track = state.tracks.find(t => t.name === cfg.activeTrack);
    if (track) await loadVideoAt(track, cfg.activeTimestamp);
  }

  state.isDirty = false;
  btnSave.classList.remove('dirty');
}

// ── Recent projects ───────────────────────────────────────────────────────────

async function populateRecent() {
  const recent = await idbGetRecent();
  const listEl = document.getElementById('recentList');
  const itemsEl = document.getElementById('recentItems');
  if (!recent.length) { listEl.style.display = 'none'; return; }

  itemsEl.innerHTML = '';
  for (const entry of recent) {
    const item = document.createElement('div');
    item.className = 'recent-item';

    const nameEl = document.createElement('span');
    nameEl.className   = 'recent-item-name';
    nameEl.textContent = entry.name;
    nameEl.title       = entry.name;

    const removeEl = document.createElement('span');
    removeEl.className   = 'recent-item-remove';
    removeEl.textContent = '✕';
    removeEl.title       = 'Remove from list';
    removeEl.addEventListener('click', async e => {
      e.stopPropagation();
      const all  = await idbGetRecent();
      const keep = await Promise.all(all.map(r => r.handle.isSameEntry(entry.handle).catch(() => false)));
      await idbSet('recent', all.filter((_, i) => !keep[i]));
      populateRecent();
    });

    item.appendChild(nameEl);
    item.appendChild(removeEl);
    item.addEventListener('click', () => openRecent(entry.handle));
    itemsEl.appendChild(item);
  }
  listEl.style.display = '';
}

async function openRecent(handle) {
  const perm = await handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
  if (perm !== 'granted') return;
  await idbSet('config', handle);
  await idbPushRecent(handle);
  state.configHandle = handle;
  const cfg = await loadProject();
  await initMap(cfg);
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function init() {
  // Seed history so the browser back button always has a welcome entry to pop to
  history.replaceState({ screen: 'welcome' }, '', '#');

  populateRecent();  // populate async, doesn't block welcome screen

  const stored = await idbGet('config').catch(() => null);
  if (!stored) { showScreen('welcome'); return; }

  const perm = await stored.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
  if (perm !== 'granted') { showScreen('welcome'); return; }

  state.configHandle = stored;
  const cfg = await loadProject();
  await initMap(cfg);
}

// ── Welcome screen ────────────────────────────────────────────────────────────

document.getElementById('btnNewProject').addEventListener('click', async () => {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'project.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    await idbSet('config', handle);
    await idbPushRecent(handle);
    state.configHandle = handle;
    state.folders = []; state.tracks = []; state.orphanedPairs = [];
    showScreen('editor');
    openEditor(
      'new',
      async () => { const cfg = await loadProject(); await initMap(cfg); },
      () => showScreen('welcome'),
    );
  } catch (e) { if (e.name !== 'AbortError') throw e; }
});

document.getElementById('btnOpenProject').addEventListener('click', async () => {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    await idbSet('config', handle);
    await idbPushRecent(handle);
    state.configHandle = handle;
    const cfg = await loadProject();
    await initMap(cfg);
  } catch (e) { if (e.name !== 'AbortError') throw e; }
});

// ── Toolbar ───────────────────────────────────────────────────────────────────

document.getElementById('btnHome').addEventListener('click', closeProject);
document.getElementById('btnBack').addEventListener('click', () => {
  if (state.histIdx > 0) { state.histIdx--; applyViewport(state.viewHistory[state.histIdx]); updateHistoryBtns(); }
});
document.getElementById('btnFwd').addEventListener('click', () => {
  if (state.histIdx < state.viewHistory.length - 1) { state.histIdx++; applyViewport(state.viewHistory[state.histIdx]); updateHistoryBtns(); }
});
document.getElementById('btnResetZoom').addEventListener('click', () => {
  pushHistory(state.initialViewport); applyViewport(state.initialViewport);
});
document.getElementById('btnBoxZoom').addEventListener('click', () => {
  state.boxZoom = !state.boxZoom;
  document.getElementById('btnBoxZoom').classList.toggle('active', state.boxZoom);
});

function rotateMap(delta) {
  state.rotation = (state.rotation + delta + 360) % 360;
  if (state.syncRotation && state.activeTrack) {
    const cur = state.videoRotations.get(state.activeTrack.name) ?? 0;
    state.videoRotations.set(state.activeTrack.name, (cur - delta + 360) % 360);
    applyVideoRotation();
    updateCompassLabels();
  }
  render(); markDirty();
}
document.getElementById('btnRotateCCW').addEventListener('click', () => rotateMap(+90));
document.getElementById('btnRotateCW' ).addEventListener('click', () => rotateMap(-90));

document.getElementById('chkSyncRotation').addEventListener('change', e => {
  state.syncRotation = e.target.checked;
  markDirty();
});
document.getElementById('btnGrid').addEventListener('click', () => {
  state.showGrid = !state.showGrid;
  document.getElementById('btnGrid').classList.toggle('active', state.showGrid);
  render(); markDirty();
});

const dsInput = document.getElementById('dsInput');
dsInput.addEventListener('change', () => {
  state.dsN = Math.max(1, parseInt(dsInput.value) || 1);
  dsInput.value = state.dsN;
  render(); markDirty();
});
dsInput.addEventListener('wheel', e => {
  e.preventDefault();
  state.dsN = Math.max(1, state.dsN + (e.deltaY > 0 ? 1 : -1));
  dsInput.value = state.dsN;
  render(); markDirty();
}, { passive: false });

btnSave.addEventListener('click', saveConfig);

document.getElementById('btnRotVidCCW').addEventListener('click', () => rotateVideo(-90));
document.getElementById('btnRotVidCW' ).addEventListener('click', () => rotateVideo(+90));
document.getElementById('btnSetNorth' ).addEventListener('click', () => {
  if (!state.activeTrack) return;
  state.compassBaseRotations.set(
    state.activeTrack.name,
    (state.rotation + (state.videoRotations.get(state.activeTrack.name) ?? 0)) % 360
  );
  updateCompassLabels();
  markDirty();
});

document.getElementById('btnManageFootage').addEventListener('click', () => {
  showScreen('editor');
  openEditor(
    'existing',
    async () => {
      showScreen('app');
      buildLegend();
      state.initialViewport = viewportFromTracks(state.tracks);
      if (!state.viewport || !state.tracks.length) state.viewport = { ...state.initialViewport };
      resizeCanvas();
      render();
      updateCompassLabels();
      await saveConfig();
    },
    () => showScreen('app'),
  );
});

// ── Video events ──────────────────────────────────────────────────────────────

videoEl.addEventListener('play',       startTrackingLoop);
videoEl.addEventListener('seeking',    syncFromVideo);
videoEl.addEventListener('timeupdate', () => { if (videoEl.paused) syncFromVideo(); });
videoEl.addEventListener('ended',      syncFromVideo);

// ── Window events ─────────────────────────────────────────────────────────────

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', e => {
  if (e.altKey && e.key === 'ArrowLeft')  document.getElementById('btnBack').click();
  if (e.altKey && e.key === 'ArrowRight') document.getElementById('btnFwd').click();
});
window.addEventListener('popstate', e => {
  const screen = e.state?.screen ?? 'welcome';
  if (screen === 'welcome' && state.configHandle) closeProject();
});
window.addEventListener('beforeunload', e => {
  if (state.isDirty) { e.preventDefault(); e.returnValue = ''; }
});

init();
