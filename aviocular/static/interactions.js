import { state } from './state.js';
import { canvas } from './dom.js';
import { project, unproject } from './projection.js';
import { render } from './render.js';
import { loadVideoAt } from './video.js';
import { pushHistory, applyViewport } from './history.js';
import { downsample, fmtTime } from './utils.js';

const tooltip = document.getElementById('tooltip');
const selBox  = document.getElementById('selectionOverlay');

function nearestPoint(px, py, threshPx = 20) {
  let best = null, bestD2 = threshPx * threshPx;
  for (const track of state.tracks) {
    if (state.hiddenTracks.has(track.name)) continue;
    for (const pt of downsample(track.points, state.dsN)) {
      const { x, y } = project(pt[1], pt[2]);
      const d2 = (x - px) ** 2 + (y - py) ** 2;
      if (d2 < bestD2) { bestD2 = d2; best = { track, pt }; }
    }
  }
  return best;
}

function canvasXY(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width  / r.width),
    y: (e.clientY - r.top)  * (canvas.height / r.height),
  };
}

function canvasXYfromClient(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (cx - r.left) * (canvas.width  / r.width),
    y: (cy - r.top)  * (canvas.height / r.height),
  };
}

function zoomAtPixel(px, py, factor) {
  const vp = state.viewport, geo = unproject(px, py);
  const dLat = (vp.maxLat - vp.minLat) * factor, dLon = (vp.maxLon - vp.minLon) * factor;
  const fLat = (geo.lat - vp.minLat) / (vp.maxLat - vp.minLat);
  const fLon = (geo.lon - vp.minLon) / (vp.maxLon - vp.minLon);
  return {
    minLat: geo.lat - fLat * dLat,       maxLat: geo.lat + (1 - fLat) * dLat,
    minLon: geo.lon - fLon * dLon,       maxLon: geo.lon + (1 - fLon) * dLon,
  };
}

function updateSelBox(cx, cy) {
  if (!state.boxStart) return;
  const panel = document.getElementById('mapPanel').getBoundingClientRect();
  const x0 = state.boxStart.x / (canvas.width  / panel.width)  + panel.left;
  const y0 = state.boxStart.y / (canvas.height / panel.height) + panel.top;
  selBox.style.left   = `${Math.min(x0, cx) - panel.left}px`;
  selBox.style.top    = `${Math.min(y0, cy) - panel.top}px`;
  selBox.style.width  = `${Math.abs(cx - x0)}px`;
  selBox.style.height = `${Math.abs(cy - y0)}px`;
}

export function setupInteractions() {
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    state.dragging = true; state.didDrag = false;
    state.dragStart = { x: e.clientX, y: e.clientY };
    state.dragLast  = { x: e.clientX, y: e.clientY };
    if (state.boxZoom) {
      state.boxStart = canvasXY(e);
      selBox.style.display = 'block';
      updateSelBox(e.clientX, e.clientY);
    }
    e.preventDefault();
  });

  canvas.addEventListener('mousemove', e => {
    const { x: cx, y: cy } = canvasXY(e);
    if (state.dragging) {
      const dx = e.clientX - state.dragLast.x, dy = e.clientY - state.dragLast.y;
      if (Math.abs(e.clientX - state.dragStart.x) > 3 || Math.abs(e.clientY - state.dragStart.y) > 3)
        state.didDrag = true;
      if (state.boxZoom) {
        updateSelBox(e.clientX, e.clientY);
      } else {
        const W = canvas.width, H = canvas.height, vp = state.viewport;
        let dLon = 0, dLat = 0;
        switch (state.rotation) {
          case   0: dLon = -dx/W*(vp.maxLon-vp.minLon); dLat =  dy/H*(vp.maxLat-vp.minLat); break;
          case  90: dLat =  dx/W*(vp.maxLat-vp.minLat); dLon =  dy/H*(vp.maxLon-vp.minLon); break;
          case 180: dLon =  dx/W*(vp.maxLon-vp.minLon); dLat = -dy/H*(vp.maxLat-vp.minLat); break;
          case 270: dLat = -dx/W*(vp.maxLat-vp.minLat); dLon = -dy/H*(vp.maxLon-vp.minLon); break;
        }
        state.viewport = {
          minLat: vp.minLat + dLat, maxLat: vp.maxLat + dLat,
          minLon: vp.minLon + dLon, maxLon: vp.maxLon + dLon,
        };
        render();
      }
      state.dragLast = { x: e.clientX, y: e.clientY };
    }

    if (!state.dragging || !state.didDrag) {
      const hit = nearestPoint(cx, cy);
      if (hit) {
        const [t, lat, lon] = hit.pt;
        const panel = document.getElementById('mapPanel').getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.left    = `${e.clientX - panel.left + 12}px`;
        tooltip.style.top     = `${e.clientY - panel.top  - 24}px`;
        tooltip.textContent   = `${hit.track.name}  ${fmtTime(t)}  (${lat.toFixed(5)}°, ${lon.toFixed(5)}°)`;
      } else {
        tooltip.style.display = 'none';
      }
    }
  });

  window.addEventListener('mouseup', e => {
    if (!state.dragging) return;
    state.dragging = false;
    if (state.boxZoom && state.boxStart && state.didDrag) {
      selBox.style.display = 'none';
      const cur = canvasXY(e);
      const g1 = unproject(state.boxStart.x, state.boxStart.y), g2 = unproject(cur.x, cur.y);
      const newVp = {
        minLat: Math.min(g1.lat, g2.lat), maxLat: Math.max(g1.lat, g2.lat),
        minLon: Math.min(g1.lon, g2.lon), maxLon: Math.max(g1.lon, g2.lon),
      };
      applyViewport(newVp); pushHistory(newVp); state.boxStart = null; return;
    }
    selBox.style.display = 'none';
    if (state.didDrag) {
      pushHistory(state.viewport);
    } else {
      const { x, y } = canvasXYfromClient(e.clientX, e.clientY);
      const hit = nearestPoint(x, y);
      if (hit) loadVideoAt(hit.track, hit.pt[0]);
    }
    state.boxStart = null;
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    if (state.dragging && !state.boxZoom) { state.dragging = false; pushHistory(state.viewport); }
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const { x, y } = canvasXY(e);
    state.viewport = zoomAtPixel(x, y, e.deltaY > 0 ? 1.15 : 1 / 1.15);
    render();
    clearTimeout(state.scrollTimer);
    state.scrollTimer = setTimeout(() => pushHistory(state.viewport), 300);
  }, { passive: false });
}
