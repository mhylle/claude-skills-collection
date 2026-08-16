#!/bin/bash
# test-interactive-skills.sh — guards skills that must run in the main conversation.
#
# A skill whose workflow requires live back-and-forth with the user (asking
# questions, waiting for answers, offering follow-ups) must NOT declare
# `context: fork`. Per the Claude Code docs, a forked skill runs in a subagent
# that (a) has no access to the conversation history and (b) since v2.1.218 is
# backgrounded by default — so the user never gets to answer anything.
# `agent:` only has meaning alongside `context: fork`, so it must be absent too.
#
# Plain bash, no framework. Collects ALL failures (no set -e).
# Output: one line per test "PASS|FAIL Tn: <desc>", then "X/Y passed".
# Exit 0 only if every test passes.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/skills"
INSTALL_DIR="${CLAUDE_SKILLS_HOME:-$HOME/.claude/skills}"

# Skills whose SKILL.md body depends on a live user turn-by-turn, or that must
# hold the parent's tool set (Agent/Workflow/Write) to do their job at all.
INTERACTIVE_SKILLS=(
  agent-creator
  brainstorm
  create-plan
  deep-brainstorm
  implement-plan
  team-brainstorm
  team-create-plan
  team-implement-plan
  team-implement-plan-full
  tt-brainstorm
  tt-create-plan
  tt-implement-plan
  tt-workflow-audit
  tt-workflow-build
  tt-workflow-run
  user-story
  workflow-guide
)

# Skills that are legitimately forked: they run to completion without the user
# and their bodies say so explicitly. They must still avoid `agent: Explore|Plan`,
# because both built-in agents lack Write/Edit AND the Agent tool — so a skill
# that writes a file or spawns subagents cannot run under them.
FORKED_SKILLS=(
  codebase-research
  implement-phase
  tt-implement-phase
)

PASS_COUNT=0
TOTAL_COUNT=0

record() {
  # record <PASS|FAIL> <test-id> <description>
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if [ "$1" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  echo "$1 $2: $3"
}

# Print only the YAML frontmatter block (between the first two `---` lines).
# Body prose mentions "agent" and "fork" freely, so never grep the whole file.
frontmatter() {
  awk 'NR==1 && $0!="---" {exit} NR==1 {next} $0=="---" {exit} {print}' "$1"
}

n=0
for skill in "${INTERACTIVE_SKILLS[@]}"; do
  src="$SKILLS_DIR/$skill/SKILL.md"

  n=$((n + 1))
  if [ -f "$src" ]; then
    record PASS "T$n" "$skill: SKILL.md exists"
  else
    record FAIL "T$n" "$skill: SKILL.md exists (missing at $src)"
    continue
  fi

  fm="$(frontmatter "$src")"

  n=$((n + 1))
  if echo "$fm" | grep -qE '^context:'; then
    record FAIL "T$n" "$skill: no 'context:' in frontmatter (found: $(echo "$fm" | grep -E '^context:'))"
  else
    record PASS "T$n" "$skill: no 'context:' in frontmatter — runs in the main conversation"
  fi

  n=$((n + 1))
  if echo "$fm" | grep -qE '^agent:'; then
    record FAIL "T$n" "$skill: no 'agent:' in frontmatter (found: $(echo "$fm" | grep -E '^agent:'))"
  else
    record PASS "T$n" "$skill: no 'agent:' in frontmatter — only meaningful with context: fork"
  fi

  n=$((n + 1))
  if echo "$fm" | grep -qE '^background:'; then
    record FAIL "T$n" "$skill: no 'background:' in frontmatter — it only applies with context: fork"
  else
    record PASS "T$n" "$skill: no 'background:' in frontmatter"
  fi

  n=$((n + 1))
  if echo "$fm" | grep -qE '^name:' && echo "$fm" | grep -qE '^description:'; then
    record PASS "T$n" "$skill: frontmatter still declares name and description"
  else
    record FAIL "T$n" "$skill: frontmatter still declares name and description"
  fi

  n=$((n + 1))
  installed="$INSTALL_DIR/$skill/SKILL.md"
  if [ ! -f "$installed" ]; then
    record FAIL "T$n" "$skill: installed copy exists at $installed"
  elif diff -q "$src" "$installed" >/dev/null; then
    record PASS "T$n" "$skill: installed copy matches source (fix is live in this session)"
  else
    record FAIL "T$n" "$skill: installed copy matches source — run install.sh, $installed is stale"
  fi
done

for skill in "${FORKED_SKILLS[@]}"; do
  src="$SKILLS_DIR/$skill/SKILL.md"

  n=$((n + 1))
  if [ -f "$src" ]; then
    record PASS "T$n" "$skill: SKILL.md exists"
  else
    record FAIL "T$n" "$skill: SKILL.md exists (missing at $src)"
    continue
  fi

  fm="$(frontmatter "$src")"

  n=$((n + 1))
  if echo "$fm" | grep -qE '^context: *fork'; then
    record PASS "T$n" "$skill: keeps 'context: fork' — runs to completion without the user"
  else
    record FAIL "T$n" "$skill: keeps 'context: fork'"
  fi

  # Explore and Plan both lack Write/Edit and the Agent tool.
  n=$((n + 1))
  needs_parent_tools=no
  grep -qE 'Task\(subagent_type|Workflow\(|\bWrite\b|write the (output|file|document)' "$src" && needs_parent_tools=yes
  if echo "$fm" | grep -qE '^agent: *(Explore|Plan)' && [ "$needs_parent_tools" = yes ]; then
    record FAIL "T$n" "$skill: no read-only 'agent:' — body spawns subagents or writes files, which Explore/Plan cannot do"
  else
    record PASS "T$n" "$skill: no read-only 'agent:' blocking the tools its body needs"
  fi
done

echo
echo "$PASS_COUNT/$TOTAL_COUNT passed"
[ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]
