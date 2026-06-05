import { state, CARDINALS } from './state.js';
import { videoEl } from './dom.js';
import { render } from './render.js';
import { markDirty } from './config.js';
import { fmtTime } from './utils.js';

const videoInfo = document.getElementById('videoInfo');

export function seekPointByTime(track, t) {
  const pts = track.points;
  if (!pts.length) return null;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] < t) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(pts[lo - 1][0] - t) < Math.abs(pts[lo][0] - t)) lo--;
  state.lastPtIdx = lo;
  return pts[lo];
}

export function advancePointByTime(track, t) {
  const pts = track.points;
  if (!pts.length) return null;
  if (pts[state.lastPtIdx][0] > t + 0.5) return seekPointByTime(track, t);
  while (state.lastPtIdx < pts.length - 1 && pts[state.lastPtIdx + 1][0] <= t) state.lastPtIdx++;
  return pts[state.lastPtIdx];
}

export function updateCompassLabels() {
  const calibrated = !!(state.activeTrack && state.compassBaseRotations.has(state.activeTrack.name));
  document.getElementById('chkSyncRotation').disabled = !calibrated;
  if (!calibrated) {
    ['cTop', 'cRight', 'cBottom', 'cLeft'].forEach(id => { document.getElementById(id).textContent = '?'; });
    return;
  }
  const videoRot    = state.videoRotations.get(state.activeTrack.name) ?? 0;
  const compassBase = state.compassBaseRotations.get(state.activeTrack.name);
  const effective   = ((compassBase - videoRot) % 360 + 360) % 360;
  const c           = CARDINALS[effective];
  document.getElementById('cTop').textContent    = c.top;
  document.getElementById('cRight').textContent  = c.right;
  document.getElementById('cBottom').textContent = c.bottom;
  document.getElementById('cLeft').textContent   = c.left;
}

export function applyVideoRotation() {
  const deg = state.activeTrack ? (state.videoRotations.get(state.activeTrack.name) ?? 0) : 0;
  let scale = 1;
  if (deg % 180 !== 0 && videoEl.videoWidth && videoEl.videoHeight) {
    const wrapper = document.getElementById('videoWrapper');
    const pW = wrapper.clientWidth, pH = wrapper.clientHeight;
    const ar = videoEl.videoWidth / videoEl.videoHeight;
    const [rendW, rendH] = ar > pW / pH ? [pW, pW / ar] : [pH * ar, pH];
    scale = Math.min(pW / rendH, pH / rendW);
  }
  videoEl.style.transform = `rotate(${deg}deg) scale(${scale})`;
}

export function rotateVideo(delta) {
  if (!state.activeTrack) return;
  const cur    = state.videoRotations.get(state.activeTrack.name) ?? 0;
  const newRot = (cur + delta + 360) % 360;
  state.videoRotations.set(state.activeTrack.name, newRot);
  applyVideoRotation();
  updateCompassLabels();
  if (state.syncRotation) {
    state.rotation = (state.rotation - delta + 360) % 360;
    render();
  }
  markDirty();
}

export async function loadVideoAt(track, t) {
  const isNewTrack = state.activeTrack?.name !== track.name;
  state.activeTrack = track;
  state.lastPtIdx   = 0;
  state.activePoint = seekPointByTime(track, t);
  applyVideoRotation();
  updateCompassLabels();
  render();

  if (!track.videoHandle) {
    videoEl.src = '';
    videoInfo.textContent = `${track.name}  —  no video file`;
    markDirty();
    return;
  }

  if (isNewTrack || !state.activeBlobUrl) {
    if (state.activeBlobUrl) { URL.revokeObjectURL(state.activeBlobUrl); state.activeBlobUrl = null; }
    const file = await track.videoHandle.getFile();
    state.activeBlobUrl = URL.createObjectURL(file);
    videoEl.src = state.activeBlobUrl;
    videoEl.load();
    videoEl.addEventListener('loadedmetadata', () => {
      videoEl.currentTime = t;
      videoEl.pause();
      applyVideoRotation();
    }, { once: true });
  } else {
    videoEl.currentTime = t;
    videoEl.pause();
  }
  videoInfo.textContent = `${track.name}  —  ${fmtTime(t)}`;
  markDirty();
}

export function startTrackingLoop() {
  if (state.animFrame) return;
  function step() {
    if (!videoEl.paused && !videoEl.ended && state.activeTrack) {
      state.activePoint = advancePointByTime(state.activeTrack, videoEl.currentTime);
      videoInfo.textContent = `${state.activeTrack.name}  —  ${fmtTime(videoEl.currentTime)}`;
      render();
      state.animFrame = requestAnimationFrame(step);
    } else {
      state.animFrame = null;
    }
  }
  state.animFrame = requestAnimationFrame(step);
}

export function syncFromVideo() {
  if (!state.activeTrack) return;
  state.activePoint = seekPointByTime(state.activeTrack, videoEl.currentTime);
  videoInfo.textContent = `${state.activeTrack.name}  —  ${fmtTime(videoEl.currentTime)}`;
  render();
  markDirty();
}
