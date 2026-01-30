#!/bin/bash

# Claude Code Skills Collection Installer
# Installs skills, agents, and hooks to ~/.claude/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "Installing Claude Code Skills Collection..."

# Create directories if they don't exist
mkdir -p "$CLAUDE_DIR/skills"
mkdir -p "$CLAUDE_DIR/agents"
mkdir -p "$CLAUDE_DIR/skills/learned"

# Install skills
echo "Installing skills..."
for skill_dir in "$SCRIPT_DIR/skills"/*; do
    if [ -d "$skill_dir" ]; then
        skill_name=$(basename "$skill_dir")
        echo "  - $skill_name"
        cp -r "$skill_dir" "$CLAUDE_DIR/skills/"
    fi
done

# Install agents
echo "Installing agents..."
for agent_file in "$SCRIPT_DIR/agents"/*.md; do
    if [ -f "$agent_file" ]; then
        agent_name=$(basename "$agent_file")
        echo "  - $agent_name"
        cp "$agent_file" "$CLAUDE_DIR/agents/"
    fi
done

# Install hooks
echo "Installing hooks..."
if [ -f "$SCRIPT_DIR/hooks.json" ]; then
    if [ -f "$CLAUDE_DIR/hooks.json" ]; then
        echo "  - Backing up existing hooks.json to hooks.json.backup"
        cp "$CLAUDE_DIR/hooks.json" "$CLAUDE_DIR/hooks.json.backup"
    fi
    cp "$SCRIPT_DIR/hooks.json" "$CLAUDE_DIR/hooks.json"
    echo "  - hooks.json (strategic-compact, continuous-learning)"
fi

echo ""
echo "Installation complete!"
echo ""
echo "Skills installed to: $CLAUDE_DIR/skills/"
echo "Agents installed to: $CLAUDE_DIR/agents/"
echo "Hooks installed to:  $CLAUDE_DIR/hooks.json"
echo ""
echo "Hooks configured:"
echo ""
echo "  PreToolUse (before tool execution):"
echo "    - tmux-dev-block: Block dev servers outside tmux"
echo "    - tmux-reminder: Suggest tmux for long-running commands"
echo "    - git-push-review: Reminder before git push"
echo "    - doc-file-warn: Warn about docs outside docs/ structure"
echo "    - strategic-compact: Suggest /compact at logical boundaries"
echo ""
echo "  PostToolUse (after tool execution):"
echo "    - pr-url-logger: Log PR URL after creation"
echo "    - prettier-format: Auto-format JS/TS with Prettier"
echo "    - typescript-check: Run tsc after .ts/.tsx edits"
echo "    - console-log-warn: Warn about console.log in JS/TS"
echo ""
echo "  Stop (session end):"
echo "    - console-log-audit: Audit modified files for console.log"
echo "    - continuous-learning: Extract patterns to learned/"
echo ""
echo "  SessionStart / PreCompact:"
echo "    - load-context: Detect saved context files"
echo "    - save-context-remind: Remind to save before /compact"
echo ""
echo "Restart Claude Code to activate the new skills, agents, and hooks."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Optional: Add workflow enforcement to your projects"
echo ""
echo "  ./init-workflow.sh [project-dir] [level]"
echo ""
echo "  Levels: minimal, standard (default), strict"
echo ""
echo "  Examples:"
echo "    ./init-workflow.sh ~/projects/myapp           # Standard level"
echo "    ./init-workflow.sh ~/projects/myapp strict    # Full enforcement"
echo ""
echo "  This creates docs/plans/, docs/adr/, logs/ directories"
echo "  and adds workflow rules to CLAUDE.md (non-destructive)."
