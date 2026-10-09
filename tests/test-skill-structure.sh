#!/bin/bash
# test-skill-structure.sh — every skill follows the collection's structure standard.
#
# T1  tests/skill_structure.py: valid strict-YAML frontmatter, name == directory,
#     description <= 1024 chars, a current generated Contents block at the top of
#     SKILL.md, and a Contents section in every references/*.md over 100 lines.
#     Fix Contents failures with: python tests/skill_structure.py --write
# T2  Claude Code's own validator reports no skill problems
#     (`claude plugin validate .` prints only the files it has problems with).
# T3  The research agents /brainstorm dispatches load cleanly.
# T2 and T3 are skipped, not failed, when the `claude` CLI isn't on PATH.
#
# Plain bash, no framework. Output: "PASS|FAIL|SKIP Tn: <desc>", then "X/Y passed".

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS_COUNT=0
TOTAL_COUNT=0

record() {
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  [ "$1" = "PASS" ] && PASS_COUNT=$((PASS_COUNT + 1))
  echo "$1 $2: $3"
}

PYTHON="$(command -v python3 || command -v python)"
if out=$("$PYTHON" -X utf8 "$REPO_ROOT/tests/skill_structure.py" "$REPO_ROOT/skills" 2>&1); then
  record PASS T1 "skill structure ($(echo "$out" | tail -1))"
else
  record FAIL T1 "skill structure:"
  echo "$out" | grep -E '^FAIL' | sed 's/^/    /'
fi

if command -v claude >/dev/null 2>&1; then
  report=$(cd "$REPO_ROOT" && claude plugin validate . 2>&1)
  bad_skills=$(echo "$report" | grep -E 'Validating skill:' | sed -E 's/.*[\\/]skills[\\/]//')
  if [ -z "$bad_skills" ]; then
    record PASS T2 "claude plugin validate: no skill problems"
  else
    record FAIL T2 "claude plugin validate flags: $(echo "$bad_skills" | tr '\n' ' ')"
  fi

  bad_agents=""
  for agent in web-search-researcher codebase-locator codebase-analyzer codebase-pattern-finder; do
    echo "$report" | grep -qE "Validating agent:.*[\\/]$agent\.md" && bad_agents="$bad_agents $agent"
  done
  if [ -z "$bad_agents" ]; then
    record PASS T3 "brainstorm's research agents validate cleanly"
  else
    record FAIL T3 "agents with validator problems:$bad_agents"
  fi
else
  echo "SKIP T2: claude CLI not on PATH"
  echo "SKIP T3: claude CLI not on PATH"
fi

echo "$PASS_COUNT/$TOTAL_COUNT passed"
[ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]
