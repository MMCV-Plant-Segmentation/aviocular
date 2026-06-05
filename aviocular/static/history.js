import { state } from './state.js';
import { render } from './render.js';
import { markDirty } from './config.js';

export function pushHistory(vp) {
  state.viewHistory = state.viewHistory.slice(0, state.histIdx + 1);
  state.viewHistory.push({ ...vp });
  state.histIdx = state.viewHistory.length - 1;
  updateHistoryBtns();
  markDirty();
}

export function updateHistoryBtns() {
  document.getElementById('btnBack').disabled = state.histIdx <= 0;
  document.getElementById('btnFwd').disabled  = state.histIdx >= state.viewHistory.length - 1;
}

export function applyViewport(vp) {
  state.viewport = { ...vp };
  render();
}
