import { state } from './state.js';
import { canvas } from './dom.js';

export function project(lat, lon) {
  const vp = state.viewport;
  const W = canvas.width, H = canvas.height;
  const east  = (lon - vp.minLon) / (vp.maxLon - vp.minLon);
  const north = (lat - vp.minLat) / (vp.maxLat - vp.minLat);
  switch (state.rotation) {
    case   0: return { x: east * W,        y: (1 - north) * H };
    case  90: return { x: (1 - north) * W, y: (1 - east) * H  };
    case 180: return { x: (1 - east) * W,  y: north * H        };
    case 270: return { x: north * W,        y: east * H         };
  }
}

export function unproject(px, py) {
  const vp = state.viewport;
  const W = canvas.width, H = canvas.height;
  let east, north;
  switch (state.rotation) {
    case   0: east = px / W;      north = 1 - py / H;  break;
    case  90: north = 1 - px / W; east  = 1 - py / H;  break;
    case 180: east = 1 - px / W;  north = py / H;       break;
    case 270: north = px / W;     east  = py / H;       break;
  }
  return {
    lon: vp.minLon + east  * (vp.maxLon - vp.minLon),
    lat: vp.minLat + north * (vp.maxLat - vp.minLat),
  };
}
