# Verification commands — Python

Commands the 6-check verification loop runs on a Python project. Load this file when project detection says `python`.

---

## Tooling detection

```bash
detect_python_tooling() {
  if [ -f "pyproject.toml" ] && grep -q "\[tool.poetry\]" pyproject.toml; then
    echo "poetry"
  elif [ -f "pyproject.toml" ] && grep -q "\[tool.pdm\]" pyproject.toml; then
    echo "pdm"
  elif [ -f "Pipfile" ]; then
    echo "pipenv"
  elif [ -f "pyproject.toml" ]; then
    echo "pip"
  else
    echo "pip"
  fi
}
```

Prefix commands with `poetry run` / `pdm run` / `pipenv run` when using a venv-manager that controls the environment.

---

## Check 1 — Build

```bash
# Poetry
poetry build

# PDM
pdm build

# pip / setuptools
python -m build

# Check syntax without full build
python -m py_compile src/**/*.py

# Compile to bytecode (catches syntax errors)
python -m compileall src/
```

For non-packaged projects, syntax-check via `compileall` is the minimum.

---

## Check 2 — Types

```bash
# mypy (standard)
mypy src/

# With config
mypy src/ --config-file pyproject.toml

# pyright (faster, VSCode-compatible)
pyright src/

# Using poetry / pdm
poetry run mypy src/
pdm run mypy src/

# Type checking specific files
mypy src/module.py src/other.py
```

---

## Check 3 — Lint

```bash
# Ruff (fast, recommended)
ruff check src/
ruff check src/ --fix

# Ruff formatting
ruff format src/ --check
ruff format src/

# Flake8
flake8 src/

# Black (formatting)
black src/ --check
black src/

# isort (import sorting)
isort src/ --check-only
isort src/

# pylint (comprehensive)
pylint src/

# Using poetry / pdm
poetry run ruff check src/
pdm run ruff check src/
```

Auto-fix pattern: run with `--fix` / write mode first, then re-run without it and assert clean.

---

## Check 4 — Tests

```bash
# pytest
pytest
pytest -v
pytest --cov=src

# Specific directories
pytest tests/
pytest tests/unit/ tests/integration/

# Using poetry / pdm
poetry run pytest
pdm run pytest

# unittest (built-in)
python -m unittest discover

# With coverage (coverage.py)
coverage run -m pytest
coverage report
```

---

## Check 5 — Security (dep-vuln scan)

Python-specific:
```bash
pip-audit
safety check
```

Python-specific debug-code detection:
```bash
grep -rn "print(\|pdb\|breakpoint()\|debugger" src/ --include="*.py"
```

Allowed exceptions: test files, CLI scripts where `print()` is part of the interface, logging framework calls.
