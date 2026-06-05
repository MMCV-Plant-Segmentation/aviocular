// Mirrors aviocular/parser.py — same DJI SRT format including the 'longtitude' typo.
const TS_RE  = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
const LAT_RE = /\[latitude\s*:\s*([-\d.]+)\]/;
const LON_RE = /\[longtitude\s*:\s*([-\d.]+)\]/;

export async function parseSrt(file) {
  const text  = await file.text();
  const lines = text.split('\n');
  const pts   = [];
  for (let i = 0; i < lines.length; i++) {
    const m = TS_RE.exec(lines[i].trim());
    if (!m) continue;
    const t = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const lm = LAT_RE.exec(lines[j]);
      const nm = LON_RE.exec(lines[j]);
      if (lm && nm) { pts.push([Math.round(t * 1000) / 1000, +lm[1], +nm[1]]); break; }
    }
  }
  return pts;
}
