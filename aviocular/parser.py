import re
from pathlib import Path

_TS_RE  = re.compile(r'^(\d{2}):(\d{2}):(\d{2}),(\d{3})')
_LAT_RE = re.compile(r'\[latitude\s*:\s*([-\d.]+)\]')
_LON_RE = re.compile(r'\[longtitude\s*:\s*([-\d.]+)\]')   # DJI typo preserved

def generate_colors(n: int) -> list[str]:
    return [f'hsl({int(360 * i / n)}, 72%, 58%)' for i in range(n)]


def parse_srt(path: Path) -> list[list]:
    """Return [[t_seconds, lat, lon], ...] for every frame in the SRT."""
    points = []
    lines  = path.read_text(encoding='utf-8', errors='replace').splitlines()
    i = 0
    while i < len(lines):
        m = _TS_RE.match(lines[i].strip())
        if m:
            h, mn, s, ms = int(m[1]), int(m[2]), int(m[3]), int(m[4])
            t = h * 3600 + mn * 60 + s + ms / 1000.0
            for j in range(i + 1, min(i + 5, len(lines))):
                lm = _LAT_RE.search(lines[j])
                nm = _LON_RE.search(lines[j])
                if lm and nm:
                    points.append([round(t, 3), float(lm[1]), float(nm[1])])
                    break
        i += 1
    return points


def build_tracks(video_dir: Path) -> dict:
    pairs = []
    srt_files = sorted(video_dir.glob('*.SRT')) + sorted(video_dir.glob('*.srt'))
    seen: set[str] = set()
    for srt in srt_files:
        if srt.stem in seen:
            continue
        seen.add(srt.stem)
        video = None
        for ext in ('.MOV', '.mov', '.MP4', '.mp4', '.AVI', '.avi'):
            candidate = video_dir / (srt.stem + ext)
            if candidate.exists():
                video = candidate.name
                break
        if video is None:
            continue
        points = parse_srt(srt)
        if not points:
            continue
        pairs.append({'name': srt.stem, 'file': video, 'points': points})
    colors = generate_colors(len(pairs)) if pairs else []
    for i, pair in enumerate(pairs):
        pair['color'] = colors[i]
    return {'videos': pairs}
