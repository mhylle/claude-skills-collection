#!/bin/bash
# test-plugin-packaging.sh — guards plugin-only distribution.
#
# This repository is distributed exclusively as the `devflow` Claude Code plugin
# (ADR-0011). There is no copy-into-~/.claude install script, so every component
# must sit in the plugin's default discovery locations and no live documentation
# may tell a user to run one.
#
# Plain bash, no framework. Collects ALL failures (no set -e).
# Output: one line per test "PASS|FAIL Tn: <desc>", then "X/Y passed".
# Exit 0 only if every test passes.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_NAME="devflow"
MARKETPLACE_NAME="mhylle"

PASS_COUNT=0
TOTAL_COUNT=0

record() {
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if [ "$1" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  echo "$1 $2: $3"
}

# ---------------------------------------------------------------------------
# T1-T3 — LICENSE
# ---------------------------------------------------------------------------
LICENSE="$REPO_ROOT/LICENSE"

if [ -f "$LICENSE" ]; then
  record PASS T1 "LICENSE file exists at the repo root"
else
  record FAIL T1 "LICENSE file exists at the repo root (missing)"
fi

if [ -f "$LICENSE" ] && grep -q "MIT License" "$LICENSE" \
   && grep -q "WITHOUT WARRANTY OF ANY KIND" "$LICENSE"; then
  record PASS T2 "LICENSE carries the MIT License text"
else
  record FAIL T2 "LICENSE carries the MIT License text"
fi

if [ -f "$LICENSE" ] && grep -qE 'Copyright \(c\) [0-9]{4}(-[0-9]{4})? Martin Hylleberg' "$LICENSE"; then
  record PASS T3 "LICENSE names the copyright holder"
else
  record FAIL T3 "LICENSE names the copyright holder"
fi

# Both manifests must declare the same license the file grants.
t4_ok=1
for m in .claude-plugin/plugin.json .claude-plugin/marketplace.json; do
  grep -q '"license": *"MIT"' "$REPO_ROOT/$m" || t4_ok=0
done
if [ "$t4_ok" -eq 1 ]; then
  record PASS T4 "both manifests declare \"license\": \"MIT\""
else
  record FAIL T4 "both manifests declare \"license\": \"MIT\""
fi

# ---------------------------------------------------------------------------
# T5-T6 — no copy-install path survives
# ---------------------------------------------------------------------------
if [ -e "$REPO_ROOT/install.sh" ]; then
  record FAIL T5 "install.sh is gone — distribution is plugin-only"
else
  record PASS T5 "install.sh is gone — distribution is plugin-only"
fi

# Naming the retired script is fine (the README's migration note does). Telling anyone
# to RUN it is not — that is what this forbids.
live_refs="$(grep -rlnE '(\./|bash |sh )install\.sh' \
  "$REPO_ROOT/README.md" "$REPO_ROOT/documentation" "$REPO_ROOT/tests" \
  2>/dev/null | grep -v 'test-plugin-packaging\.sh' | sed "s|$REPO_ROOT/||")"
if [ -z "$live_refs" ]; then
  record PASS T6 "no live docs or tests invoke install.sh"
else
  record FAIL T6 "no live docs or tests invoke install.sh (found in: $(echo "$live_refs" | tr '\n' ' '))"
fi

# ---------------------------------------------------------------------------
# T7-T10 — components sit in the plugin's default discovery locations
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/.claude-plugin/plugin.json" ] \
   && grep -q "\"name\": *\"$PLUGIN_NAME\"" "$REPO_ROOT/.claude-plugin/plugin.json"; then
  record PASS T7 "plugin manifest declares name '$PLUGIN_NAME'"
else
  record FAIL T7 "plugin manifest declares name '$PLUGIN_NAME'"
fi

if [ -f "$REPO_ROOT/.claude-plugin/marketplace.json" ] \
   && grep -q "\"name\": *\"$MARKETPLACE_NAME\"" "$REPO_ROOT/.claude-plugin/marketplace.json" \
   && grep -q '"source": *"\./"' "$REPO_ROOT/.claude-plugin/marketplace.json"; then
  record PASS T8 "marketplace manifest declares '$MARKETPLACE_NAME' with source \"./\""
else
  record FAIL T8 "marketplace manifest declares '$MARKETPLACE_NAME' with source \"./\""
fi

# hooks/hooks.json is the location Claude Code scans by default. With the install
# script gone there is no reason to keep the file at the root behind a manifest
# override, and an override is one more thing to drift.
if [ -f "$REPO_ROOT/hooks/hooks.json" ] && [ ! -e "$REPO_ROOT/hooks.json" ]; then
  record PASS T9 "hooks live at the default hooks/hooks.json, not the repo root"
else
  record FAIL T9 "hooks live at the default hooks/hooks.json, not the repo root"
fi

if grep -q '"hooks":' "$REPO_ROOT/.claude-plugin/plugin.json"; then
  record FAIL T10 "plugin.json has no 'hooks' path override — the default location is used"
else
  record PASS T10 "plugin.json has no 'hooks' path override — the default location is used"
fi

# Nothing may be moved under .claude-plugin/: only the two manifests belong there.
stray="$(find "$REPO_ROOT/.claude-plugin" -mindepth 1 -maxdepth 1 \
  ! -name 'plugin.json' ! -name 'marketplace.json' 2>/dev/null)"
if [ -z "$stray" ]; then
  record PASS T11 ".claude-plugin/ holds only the two manifests"
else
  record FAIL T11 ".claude-plugin/ holds only the two manifests (stray: $stray)"
fi

# ---------------------------------------------------------------------------
# T12 — the plugin still ships every component the repo claims
# ---------------------------------------------------------------------------
skill_count="$(find "$REPO_ROOT/skills" -maxdepth 2 -name SKILL.md 2>/dev/null | wc -l)"
agent_count="$(find "$REPO_ROOT/agents" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)"
if [ "$skill_count" -gt 0 ] && [ "$agent_count" -gt 0 ]; then
  record PASS T12 "plugin root ships $skill_count skills and $agent_count agents in default locations"
else
  record FAIL T12 "plugin root ships skills and agents in default locations (skills=$skill_count agents=$agent_count)"
fi

echo
echo "$PASS_COUNT/$TOTAL_COUNT passed"
[ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]
