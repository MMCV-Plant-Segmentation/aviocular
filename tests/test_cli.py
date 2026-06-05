import sys
import argparse
import pytest
from unittest.mock import patch
from aviocular.cli import main, _parse_bool


# ── _parse_bool ───────────────────────────────────────────────────────────────

def test_parse_bool_true_values():
    for v in ('true', 'True', '1', 'yes', 'YES', 't', 'y'):
        assert _parse_bool(v) is True


def test_parse_bool_false_values():
    for v in ('false', 'False', '0', 'no', 'NO', 'f', 'n'):
        assert _parse_bool(v) is False


def test_parse_bool_invalid():
    with pytest.raises(argparse.ArgumentTypeError):
        _parse_bool('banana')


# ── main ──────────────────────────────────────────────────────────────────────

def test_main_prompt_no(monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['aviocular'])
    with patch('aviocular.cli.app') as mock_app:
        with patch('builtins.input', return_value='n'):
            main()
    mock_app.run.assert_called_once_with(host='127.0.0.1', port=5001, debug=False, threaded=True)


def test_main_prompt_yes(monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['aviocular'])
    with patch('aviocular.cli.app'):
        with patch('builtins.input', return_value='y'):
            with patch('aviocular.cli.Timer') as mock_timer:
                main()
    mock_timer.return_value.start.assert_called_once()


def test_main_open_browser_flag(monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['aviocular', '--open-browser'])
    with patch('aviocular.cli.app'):
        with patch('aviocular.cli.Timer') as mock_timer:
            main()
    mock_timer.return_value.start.assert_called_once()


def test_main_open_browser_explicit_true(monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['aviocular', '--open-browser=true'])
    with patch('aviocular.cli.app'):
        with patch('aviocular.cli.Timer') as mock_timer:
            main()
    mock_timer.return_value.start.assert_called_once()


def test_main_open_browser_explicit_false(monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['aviocular', '--open-browser=false'])
    with patch('aviocular.cli.app'):
        with patch('aviocular.cli.Timer') as mock_timer:
            main()
    mock_timer.return_value.start.assert_not_called()


def test_main_open_browser_invalid_value(monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['aviocular', '--open-browser=banana'])
    with pytest.raises(SystemExit):
        main()


def test_main_with_port(monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['aviocular', '--port', '8888'])
    with patch('aviocular.cli.app') as mock_app:
        with patch('builtins.input', return_value='n'):
            main()
    mock_app.run.assert_called_once_with(host='127.0.0.1', port=8888, debug=False, threaded=True)
