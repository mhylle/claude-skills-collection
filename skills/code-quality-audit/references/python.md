# Python — code quality audit reference

Commands and parsing notes for auditing Python projects. The main SKILL.md calls these.

## Tool choices

| Axis | Tool | Why |
|------|------|-----|
| Coverage | `coverage.py` (via `pytest --cov`) | Standard; integrates with pytest; json reporter is parseable |
| Complexity | `radon cc` | Purpose-built for Python cyclomatic complexity |
| Module size | `radon raw` (LOC per file) or `wc -l` | radon excludes blank/comment lines cleanly |
| Dependencies | `pydeps` or `pycycle` | `pycycle` is narrower but faster for cycle detection only |
| Mutation | `mutmut` (preferred) or `cosmic-ray` | mutmut has simpler config and faster wall-clock on small projects |

## Standard exclusions

```
.venv/
venv/
env/
__pycache__/
.tox/
build/
dist/
*.egg-info/
migrations/
tests/
test_*.py
*_test.py
conftest.py
```

## Commands

### Tool availability check

Use quiet checks — both stdout and stderr suppressed, only the exit code tells you whether the tool is there:

```bash
python3 -c "import coverage" >/dev/null 2>&1 && echo "coverage: ok" || echo "coverage: MISSING"
python3 -c "import radon"    >/dev/null 2>&1 && echo "radon: ok"    || echo "radon: MISSING"
python3 -c "import pydeps"   >/dev/null 2>&1 && echo "pydeps: ok"   || echo "pydeps: MISSING"
python3 -c "import mutmut"   >/dev/null 2>&1 && echo "mutmut: ok"   || echo "mutmut: MISSING"
command -v pycycle >/dev/null 2>&1 && echo "pycycle: ok" || echo "pycycle: MISSING"
```

Don't print the raw ImportError tracebacks — the `2>&1` suppression is deliberate. A missing tool is a normal finding, not a crash.

Install commands:
- `pip install coverage pytest pytest-cov`
- `pip install radon`
- `pip install pydeps` (or `pip install pycycle` for cycles only)
- `pip install mutmut`

### Coverage
```bash
python -m pytest --cov --cov-report=json --cov-report=term \
  > /tmp/code-quality-audit-coverage.log 2>&1
```

Parse `coverage.json` → `.totals.percent_covered` for line coverage and `.totals.percent_covered_display` for display. Branch coverage requires `--cov-branch`:
```bash
python -m pytest --cov --cov-branch --cov-report=json
```

If the project doesn't use pytest, fall back to:
```bash
coverage run -m unittest discover && coverage json -o coverage.json
```

### Complexity
```bash
radon cc -j -a src/ > /tmp/code-quality-audit-complexity.log 2>&1
```

`-j` is JSON output; `-a` adds the average. Parse the JSON: each file maps to a list of blocks (functions/methods) with a `complexity` field. Functions with `complexity > 10` are warns, `> 20` are fails. Report the worst 5 with file and function name.

If `src/` isn't the layout, adapt — check `pyproject.toml` for the package dir, or use `find . -name '*.py' -not -path './.*'` to discover.

### Module size
```bash
radon raw -j src/ > /tmp/code-quality-audit-size.log 2>&1
```

Parse JSON; each file has `loc` (lines of code, excluding blanks/comments). Flag files over 300 (warn) and 500 (fail).

### Dependencies
Prefer `pycycle` for cycle detection (fast, focused):
```bash
pycycle --here --ignore .venv,venv,build,dist \
  > /tmp/code-quality-audit-deps.log 2>&1 || true
```

Any reported cycle is a fail.

**Known pycycle false negative — verify before trusting "no cycles".** pycycle resolves imports against the declared package name in `pyproject.toml`. If the project uses a `src/` layout where imports look like `from src.foo import bar` but the declared package name is something else (e.g. `my-package`), pycycle's resolver fails to match the `src.` prefix to a package and silently reports "no cycles" even when the import graph clearly has one. This is common in Python projects with non-standard layouts.

Mitigation: after running pycycle, do a 30-second sanity check — grep for `from src.` or `from .` imports across the tree and sketch the graph mentally. If pycycle says "no cycles" but inspection suggests otherwise, trust the inspection and note in the report that pycycle's output looks unreliable on this project (likely a package-layout mismatch). A fallback check:

```bash
# Quick AST-based grep for circular imports (catches src/-layout cases pycycle misses)
grep -rn "^from src\." src/ 2>/dev/null | sort
```

Then manually look for A imports B and B imports A.

For fan-in/fan-out analysis, use pydeps:
```bash
pydeps src/ --show-deps --no-output \
  > /tmp/code-quality-audit-deps-full.log 2>&1
```

pydeps outputs DOT; parse `import X` edges to count inbound edges per module. Modules with fan-in > 15 are "hot modules" — flag them.

### Mutation
```bash
mutmut run --paths-to-mutate src/ \
  > /tmp/code-quality-audit-mutation.log 2>&1
mutmut results > /tmp/code-quality-audit-mutation-results.log 2>&1
```

Parse the results summary. Mutation score = killed / (killed + survived + timeout). Warn below 60%, fail below 40%.

**Slow**: mutmut typically takes 5–30+ min for medium projects. Tell the user before starting. On first run, mutmut creates a `.mutmut-cache` — that's expected, don't treat it as repo pollution.

If `cosmic-ray` is the tool installed instead:
```bash
cosmic-ray init config.toml session.sqlite
cosmic-ray exec config.toml session.sqlite
cr-rate session.sqlite
```

Parse the rate output for the mutation score.
