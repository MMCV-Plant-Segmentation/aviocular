from pathlib import Path
from aviocular.parser import parse_srt, build_tracks, generate_colors

SAMPLE_SRT = """\
1
00:00:00,033 --> 00:00:00,066
<font size="36">FrameCnt : 2, DiffTime : 33ms
2026-06-03 10:58:51,123
[latitude : 38.904583] [longtitude : -92.282375] [altitude: 254.49] </font>

2
00:00:00,066 --> 00:00:00,099
<font size="36">FrameCnt : 3, DiffTime : 33ms
2026-06-03 10:58:51,156
[latitude : 38.904590] [longtitude : -92.282380] [altitude: 254.52] </font>

3
00:00:01,000 --> 00:00:01,033
<font size="36">FrameCnt : 31, DiffTime : 33ms
2026-06-03 10:58:52,123
[latitude : 38.904600] [longtitude : -92.282390] [altitude: 254.60] </font>
"""


def test_parse_srt_points(tmp_path):
    srt = tmp_path / 'DJI_0001.SRT'
    srt.write_text(SAMPLE_SRT, encoding='utf-8')

    pts = parse_srt(srt)

    assert len(pts) == 3
    assert pts[0] == [0.033, 38.904583, -92.282375]
    assert pts[1] == [0.066, 38.904590, -92.282380]
    assert pts[2] == [1.000, 38.904600, -92.282390]


def test_parse_srt_timestamp_arithmetic(tmp_path):
    srt = tmp_path / 'test.SRT'
    srt.write_text("""\
1
01:02:03,456 --> 01:02:03,489
<font size="36">FrameCnt : 1
2026-06-03 10:00:00
[latitude : 1.0] [longtitude : 2.0] [altitude: 10.0] </font>
""", encoding='utf-8')

    pts = parse_srt(srt)

    assert len(pts) == 1
    assert pts[0][0] == round(1 * 3600 + 2 * 60 + 3 + 456 / 1000, 3)


def test_parse_srt_empty_file(tmp_path):
    srt = tmp_path / 'empty.SRT'
    srt.write_text('', encoding='utf-8')

    assert parse_srt(srt) == []


def test_build_tracks_basic(tmp_path):
    (tmp_path / 'DJI_0001.SRT').write_text(SAMPLE_SRT, encoding='utf-8')
    (tmp_path / 'DJI_0001.MOV').write_bytes(b'')

    result = build_tracks(tmp_path)

    assert len(result['videos']) == 1
    track = result['videos'][0]
    assert track['name']  == 'DJI_0001'
    assert track['file']  == 'DJI_0001.MOV'
    assert track['color'].startswith('hsl(')
    assert len(track['points']) == 3


def test_build_tracks_skips_unpaired_srt(tmp_path):
    (tmp_path / 'DJI_0002.SRT').write_text(SAMPLE_SRT, encoding='utf-8')

    assert build_tracks(tmp_path)['videos'] == []


def test_build_tracks_skips_srt_with_no_gps(tmp_path):
    (tmp_path / 'DJI_0001.SRT').write_text('no gps data here', encoding='utf-8')
    (tmp_path / 'DJI_0001.MOV').write_bytes(b'')

    assert build_tracks(tmp_path)['videos'] == []


def test_build_tracks_deduplicates_case_variants(tmp_path):
    (tmp_path / 'DJI_0001.SRT').write_text(SAMPLE_SRT, encoding='utf-8')
    (tmp_path / 'DJI_0001.srt').write_text(SAMPLE_SRT, encoding='utf-8')
    (tmp_path / 'DJI_0001.MOV').write_bytes(b'')

    result = build_tracks(tmp_path)
    assert len(result['videos']) == 1


def test_build_tracks_hsl_palette(tmp_path):
    n = 4
    for i in range(1, n + 1):
        name = f'DJI_{i:04d}'
        (tmp_path / f'{name}.SRT').write_text(SAMPLE_SRT, encoding='utf-8')
        (tmp_path / f'{name}.MOV').write_bytes(b'')

    result = build_tracks(tmp_path)
    colors = [t['color'] for t in result['videos']]

    assert len(colors) == n
    assert all(c.startswith('hsl(') for c in colors)
    assert len(set(colors)) == n                  # all distinct for n tracks


def test_generate_colors_spread(tmp_path):
    colors = generate_colors(4)
    hues = [int(c.split('(')[1].split(',')[0]) for c in colors]
    assert hues == [0, 90, 180, 270]
