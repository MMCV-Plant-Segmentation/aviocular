import argparse
import webbrowser
from threading import Timer

from .server import app


def _parse_bool(v: str) -> bool:
    if v.lower() in ('true', '1', 'yes', 't', 'y'):
        return True
    if v.lower() in ('false', '0', 'no', 'f', 'n'):
        return False
    raise argparse.ArgumentTypeError(f'Expected true/false, got: {v!r}')


def main() -> None:
    parser = argparse.ArgumentParser(
        prog='aviocular',
        description='GPS route viewer + video player for DJI drone footage.',
    )
    parser.add_argument('--port', type=int, default=5001, metavar='PORT',
                        help='Port to serve on (default: 5001)')
    parser.add_argument('--open-browser', nargs='?', const=True, default=None,
                        type=_parse_bool, metavar='BOOL',
                        help='Open browser on startup (true/false; omit to be prompted)')
    args = parser.parse_args()

    port = args.port
    url  = f'http://localhost:{port}'
    print(f'Serving at {url}')
    if args.open_browser is None:
        resp = input('Open browser? [y/N] ').strip().lower()
        open_browser = resp in ('y', 'yes')
    else:
        open_browser = args.open_browser
    if open_browser:
        Timer(0.8, lambda: webbrowser.open(url)).start()
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)
