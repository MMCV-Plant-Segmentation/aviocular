# Plan 04: GitHub and uvx packaging

## Goals

- Publish the project to GitHub
- Make it runnable with `uvx --from git+https://github.com/<user>/<repo> <tool>` (no clone required)

---

## Naming note

The GitHub repo name and the uvx tool name are independent — the tool name comes from `[project.scripts]` in `pyproject.toml`. Convention is to keep them matching. Pick a name and use it consistently for the repo, the `[project] name`, and the script key.

---

## .gitignore

```
__pycache__/
.pytest_cache/
*.pyc
.venv/
dist/
*.egg-info/
```

---

## pyproject.toml

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "<chosen-name>"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["flask"]

[project.scripts]
<chosen-name> = "drone_map.cli:main"
```

`drone-map.py` (the root uv script shim) stays for local dev convenience (`uv run drone-map.py`). It and `pyproject.toml` coexist without conflict.

### Static files

Flask resolves `static_folder='static'` and `template_folder='templates'` relative to `server.py`'s location — i.e. `drone_map/static/` and `drone_map/templates/`. Hatchling includes all files inside the `drone_map/` directory by default, so no extra configuration needed.

---

## Entry point

`drone_map/cli.py:main()` already exists and is complete. No changes needed.

---

## Running after install

```bash
# Local dev
uv run drone-map.py

# From GitHub
uvx --from git+https://github.com/<user>/<repo> <tool>
```

---

## Implementation order

1. Pick a name (repo, package, script — all the same)
2. Write `.gitignore`
3. Write `pyproject.toml`
4. Smoke-test locally: `uvx --from . <tool>`
5. `git init` + initial commit
6. Create GitHub repo and push
