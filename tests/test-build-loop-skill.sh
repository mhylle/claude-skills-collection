#!/bin/bash
# test-build-loop-skill.sh — guards the tt-create-build-loop skill.
#
# The skill writes an unattended build-loop prompt for any project from a template.
# The template was generalised from one real project's loop, so this guard keeps that
# project's specifics out of it, keeps every placeholder and optional block documented,
# proves every flag combination renders cleanly, and runs the bundled tooling's tests.
#
# Plain bash, no framework. Collects ALL failures (no set -e).
# Output: one line per test "PASS|FAIL Tn: <desc>", then "X/Y passed".
# Exit 0 only if every test passes.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="tt-create-build-loop"
SKILL_DIR="$REPO_ROOT/skills/$SKILL"
TEMPLATE="$SKILL_DIR/references/loop-template.md"
GATE_TEMPLATE="$SKILL_DIR/assets/run-orch-gate.sh"
PLACEHOLDERS="$SKILL_DIR/references/placeholders.md"
EXAMPLE_VALUES="$SKILL_DIR/references/example-values.json"
RENDER="$SKILL_DIR/scripts/render-template.mjs"
TOKEN_ASSETS="$SKILL_DIR/assets/token-usage"

# Specifics of the project the loop was generalised from, which must not leak into the
# template: its name, its owner, its host, and anything that identifies one instance.
FORBIDDEN='numberfall|martin|mhylle|swiftshader|answerRightUntil|WSL2?\b|opus-4-8|Phase (0[1-9]|[1-9][0-9])\b'
IPV4='\b([0-9]{1,3}\.){3}[0-9]{1,3}\b'
UUID='\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b'

PASS_COUNT=0
TOTAL_COUNT=0
n=0

record() {
  # record <PASS|FAIL> <description>
  n=$((n + 1))
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if [ "$1" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  echo "$1 T$n: $2"
}

check() {
  # check <description> <command...> — PASS when the command succeeds.
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then record PASS "$desc"; else record FAIL "$desc"; fi
}

# Print only the YAML frontmatter block (between the first two `---` lines).
frontmatter() {
  awk 'NR==1 && $0!="---" {exit} NR==1 {next} $0=="---" {exit} {print}' "$1"
}

# A file's text without the blocks explicitly marked as examples.
without_examples() {
  awk '/<!-- example -->/ {skip=1} !skip {print} /<!-- end:example -->/ {skip=0}' "$1"
}

# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------
for f in SKILL.md references/loop-template.md references/placeholders.md \
         references/lessons-catalogue.md references/token-tooling.md \
         references/example-values.json scripts/render-template.mjs \
         scripts/install-token-tooling.mjs assets/run-orch-gate.sh \
         assets/token-usage/scripts/token-usage.mjs assets/token-usage/scripts/pricing.json \
         assets/token-usage/settings-hooks.json assets/token-usage/gitignore.snippet; do
  check "$SKILL: $f exists" test -f "$SKILL_DIR/$f"
done

# ---------------------------------------------------------------------------
# Frontmatter: interactive, so it must run in the main conversation
# ---------------------------------------------------------------------------
fm="$(frontmatter "$SKILL_DIR/SKILL.md" 2>/dev/null)"
if echo "$fm" | grep -qE "^name: *$SKILL *$"; then
  record PASS "frontmatter name matches the directory ($SKILL)"
else
  record FAIL "frontmatter name matches the directory ($SKILL)"
fi
if echo "$fm" | grep -qE '^description: *[^ ].{80,}'; then
  record PASS "frontmatter has a substantive description"
else
  record FAIL "frontmatter has a substantive description"
fi
for key in context agent background; do
  if echo "$fm" | grep -qE "^$key:"; then
    record FAIL "frontmatter has no '$key:' — the skill asks the user questions"
  else
    record PASS "frontmatter has no '$key:' — the skill asks the user questions"
  fi
done
if grep -qE "^  $SKILL$" "$REPO_ROOT/tests/test-interactive-skills.sh"; then
  record PASS "$SKILL is listed in test-interactive-skills.sh's INTERACTIVE_SKILLS"
else
  record FAIL "$SKILL is listed in test-interactive-skills.sh's INTERACTIVE_SKILLS"
fi

# ---------------------------------------------------------------------------
# No source-project specifics in the templates
# ---------------------------------------------------------------------------
for tpl in "$TEMPLATE" "$GATE_TEMPLATE"; do
  name="$(basename "$tpl")"
  body="$(without_examples "$tpl" 2>/dev/null)"
  hits="$(echo "$body" | grep -niE "$FORBIDDEN" | head -5)"
  if [ -n "$body" ] && [ -z "$hits" ]; then
    record PASS "$name names no source-project specifics"
  else
    record FAIL "$name names no source-project specifics: $(echo "$hits" | tr '\n' ' ')"
  fi
  hits="$(echo "$body" | grep -noE "$IPV4|$UUID" | head -5)"
  if [ -n "$body" ] && [ -z "$hits" ]; then
    record PASS "$name holds no IP addresses or UUIDs"
  else
    record FAIL "$name holds no IP addresses or UUIDs: $(echo "$hits" | tr '\n' ' ')"
  fi
done

# The bundled tooling ships in a public plugin: no source-project names in it either.
hits="$(grep -rliE 'numberfall|mhylle' "$TOKEN_ASSETS" 2>/dev/null | sed "s|$SKILL_DIR/||" | head -5)"
if [ -d "$TOKEN_ASSETS" ] && [ -z "$hits" ]; then
  record PASS "token-usage assets name no source project"
else
  record FAIL "token-usage assets name no source project: $(echo "$hits" | tr '\n' ' ')"
fi

# ---------------------------------------------------------------------------
# Every placeholder and optional block is documented, and nothing documented is stale
# ---------------------------------------------------------------------------
used="$(cat "$TEMPLATE" "$GATE_TEMPLATE" 2>/dev/null | grep -oE '\{\{[A-Z0-9_]+\}\}' | sort -u)"
documented="$(grep -oE '^\| `\{\{[A-Z0-9_]+\}\}`' "$PLACEHOLDERS" 2>/dev/null | grep -oE '\{\{[A-Z0-9_]+\}\}' | sort -u)"
undocumented="$(comm -23 <(echo "$used") <(echo "$documented") | tr '\n' ' ')"
stale="$(comm -13 <(echo "$used") <(echo "$documented") | tr '\n' ' ')"
if [ -n "$used" ] && [ -z "${undocumented// /}" ]; then
  record PASS "every placeholder the templates use is documented ($(echo "$used" | wc -l) placeholders)"
else
  record FAIL "every placeholder the templates use is documented (missing: $undocumented)"
fi
if [ -n "$documented" ] && [ -z "${stale// /}" ]; then
  record PASS "every documented placeholder is used by a template"
else
  record FAIL "every documented placeholder is used by a template (stale: $stale)"
fi

flags_used="$(cat "$TEMPLATE" "$GATE_TEMPLATE" 2>/dev/null | grep -oE '<!-- if:!?[a-z0-9-]+ -->' | sed -E 's/<!-- if:!?//; s/ -->//' | sort -u)"
flags_documented="$(grep -oE '^\| `[a-z0-9-]+` \|' "$PLACEHOLDERS" 2>/dev/null | grep -oE '`[a-z0-9-]+`' | tr -d '`' | sort -u)"
undocumented="$(comm -23 <(echo "$flags_used") <(echo "$flags_documented") | tr '\n' ' ')"
if [ -n "$flags_used" ] && [ -z "${undocumented// /}" ]; then
  record PASS "every optional-block flag is documented ($(echo "$flags_used" | wc -l) flags)"
else
  record FAIL "every optional-block flag is documented (missing: $undocumented)"
fi

for tpl in "$TEMPLATE" "$GATE_TEMPLATE"; do
  opens="$(grep -oE '<!-- if:!?[a-z0-9-]+ -->' "$tpl" 2>/dev/null | wc -l)"
  closes="$(grep -oE '<!-- end:!?[a-z0-9-]+ -->' "$tpl" 2>/dev/null | wc -l)"
  if [ -f "$tpl" ] && [ "$opens" = "$closes" ]; then
    record PASS "$(basename "$tpl") closes every block it opens ($opens)"
  else
    record FAIL "$(basename "$tpl") closes every block it opens (if=$opens end=$closes)"
  fi
done

# ---------------------------------------------------------------------------
# Every flag combination renders cleanly (all on, all off, the example as given)
# ---------------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  for mode in as-given all-on all-off; do
    out="$(node "$RENDER" --template "$TEMPLATE" --values "$EXAMPLE_VALUES" --flags "$mode" 2>&1)"
    rc=$?
    leftover="$(echo "$out" | grep -nE '\{\{[A-Z0-9_]+\}\}|<!-- (if|end):' | head -3)"
    if [ $rc -eq 0 ] && [ -z "$leftover" ] && [ -n "$out" ]; then
      record PASS "the example renders with flags $mode, no placeholder or block marker left"
    else
      record FAIL "the example renders with flags $mode (rc=$rc): $(echo "$out$leftover" | tail -3 | tr '\n' ' ')"
    fi
  done
  out="$(node "$RENDER" --template "$GATE_TEMPLATE" --values "$EXAMPLE_VALUES" 2>&1)"
  rc=$?
  if [ $rc -eq 0 ] && echo "$out" | bash -n 2>/dev/null; then
    record PASS "run-orch-gate.sh renders from the example and parses as bash"
  else
    record FAIL "run-orch-gate.sh renders from the example and parses as bash (rc=$rc)"
  fi

  if (cd "$SKILL_DIR/scripts" && node --test test/*.test.mjs >/dev/null 2>&1); then
    record PASS "the skill's script tests pass (node --test scripts/test/*.test.mjs)"
  else
    record FAIL "the skill's script tests pass (node --test scripts/test/*.test.mjs)"
  fi
  if (cd "$TOKEN_ASSETS" && node --test tooling/token-usage/test/*.test.mjs >/dev/null 2>&1); then
    record PASS "the bundled token-usage tests pass from the asset directory"
  else
    record FAIL "the bundled token-usage tests pass from the asset directory"
  fi
else
  record FAIL "node is on PATH (needed to render the template and run the asset tests)"
fi

# ---------------------------------------------------------------------------
# Distribution
# ---------------------------------------------------------------------------
if grep -q "\*\*$SKILL\*\*" "$REPO_ROOT/README.md"; then
  record PASS "README lists $SKILL"
else
  record FAIL "README lists $SKILL"
fi

echo
echo "$PASS_COUNT/$TOTAL_COUNT passed"
[ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]
