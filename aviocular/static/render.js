import { state, CARDINALS } from './state.js';
import { canvas, ctx } from './dom.js';
import { project } from './projection.js';
import { downsample, clamp, niceInterval, fmtCoord } from './utils.js';

export function render() {
  if (!state.viewport) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  if (state.showGrid) drawGrid(W, H);
  for (const track of state.tracks) drawTrack(track);

  if (state.activeTrack && state.activePoint && !state.hiddenTracks.has(state.activeTrack.name)) {
    const prev  = state.lastPtIdx > 0 ? state.activeTrack.points[state.lastPtIdx - 1] : null;
    const angle = prev ? travelAngle(prev, state.activePoint) : -Math.PI / 2;
    const { x, y } = project(state.activePoint[1], state.activePoint[2]);
    drawDrone(x, y, state.activeTrack.color, angle);
  }

  drawCardinals(W, H);
}

function drawGrid(W, H) {
  const vp      = state.viewport;
  const latStep = niceInterval(vp.maxLat - vp.minLat);
  const lonStep = niceInterval(vp.maxLon - vp.minLon);
  ctx.save();
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;
  ctx.fillStyle   = '#666';    ctx.font      = '10px monospace';

  const lat0 = Math.ceil(vp.minLat / latStep) * latStep;
  for (let lat = lat0; lat <= vp.maxLat + 1e-9; lat += latStep) {
    const p1 = project(lat, vp.minLon), p2 = project(lat, vp.maxLon);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    const lbl = fmtCoord(lat, true);
    ctx.fillText(lbl, clamp(p1.x + 2, 2, W - 60), clamp(p1.y - 3, 12, H - 3));
    ctx.fillText(lbl, clamp(p2.x + 2, 2, W - 60), clamp(p2.y - 3, 12, H - 3));
  }

  const lon0 = Math.ceil(vp.minLon / lonStep) * lonStep;
  for (let lon = lon0; lon <= vp.maxLon + 1e-9; lon += lonStep) {
    const p1 = project(vp.minLat, lon), p2 = project(vp.maxLat, lon);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    const lbl = fmtCoord(lon, false);
    ctx.fillText(lbl, clamp(p1.x + 2, 2, W - 65), clamp(p1.y + 12, 12, H - 3));
    ctx.fillText(lbl, clamp(p2.x + 2, 2, W - 65), clamp(p2.y + 12, 12, H - 3));
  }
  ctx.restore();
}

function drawTrack(track) {
  if (state.hiddenTracks.has(track.name)) return;
  const pts = downsample(track.points, state.dsN);
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = track.color; ctx.lineWidth = 2;
  ctx.lineJoin = 'round'; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  let first = true;
  for (const [, lat, lon] of pts) {
    const { x, y } = project(lat, lon);
    if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = track.color; ctx.globalAlpha = 0.7;
  for (const [, lat, lon] of pts) {
    const { x, y } = project(lat, lon);
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawCardinals(W, H) {
  const c = CARDINALS[state.rotation];
  ctx.save();
  ctx.fillStyle = '#888'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  ctx.fillText(c.top,    W / 2, 16);
  ctx.fillText(c.bottom, W / 2, H - 6);
  ctx.save(); ctx.translate(14,    H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(c.left,  0, 0); ctx.restore();
  ctx.save(); ctx.translate(W - 6, H / 2); ctx.rotate( Math.PI / 2); ctx.fillText(c.right, 0, 0); ctx.restore();
  ctx.restore();
}

function travelAngle(ptA, ptB) {
  return Math.atan2(ptB[2] - ptA[2], ptB[1] - ptA[1]) - state.rotation * Math.PI / 180;
}

function drawDrone(x, y, color, anglRad) {
  const ARM = 13, ROTOR = 5.5, BODY = 4;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(anglRad);
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6;
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
  for (const deg of [45, 135, 225, 315]) {
    const r = deg * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(r) * ARM, Math.sin(r) * ARM); ctx.stroke();
  }
  ctx.strokeStyle = color;
  for (const deg of [45, 135, 225, 315]) {
    const r = deg * Math.PI / 180;
    ctx.beginPath(); ctx.arc(Math.cos(r) * ARM, Math.sin(r) * ARM, ROTOR, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.shadowBlur = 0; ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, BODY, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, -BODY + 1, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
