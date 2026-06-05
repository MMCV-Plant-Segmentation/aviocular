export function downsample(pts, n) {
  if (n <= 1) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i += n) out.push(pts[i]);
  return out;
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), ds = Math.round((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${ds}`;
}

export function fmtCoord(v, isLat) {
  const dir = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
  return `${Math.abs(v).toFixed(5)}°${dir}`;
}

export function niceInterval(range, targetTicks = 5) {
  const rough = range / targetTicks;
  const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
  const n     = rough / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

export const generateColors = n =>
  Array.from({ length: n }, (_, i) => `hsl(${Math.floor(360 * i / n)}, 72%, 58%)`);

export function viewportFromTracks(trks) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const t of trks)
    for (const [, lat, lon] of t.points) {
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    }
  const dLat = (maxLat - minLat) * 0.05 || 0.001;
  const dLon = (maxLon - minLon) * 0.05 || 0.001;
  return { minLat: minLat - dLat, maxLat: maxLat + dLat, minLon: minLon - dLon, maxLon: maxLon + dLon };
}
