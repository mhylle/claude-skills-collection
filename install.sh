#!/bin/bash

# Claude Code Skills Collection Installer
# Installs skills, agents, and hooks to ~/.claude/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

# Parse arguments
DRY_RUN=0
for arg in "$@"; do
    if [ "$arg" = "--dry-run" ]; then
        DRY_RUN=1
    fi
done

if [ "$DRY_RUN" -eq 1 ]; then
    echo "Dry run: listing what would be installed (no files will be created or copied)..."
else
    echo "Installing Claude Code Skills Collection..."
fi

# Create directories if they don't exist
if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$CLAUDE_DIR/skills"
    mkdir -p "$CLAUDE_DIR/agents"
    mkdir -p "$CLAUDE_DIR/skills/learned"
fi

# Install skills
echo "Installing skills..."
for skill_dir in "$SCRIPT_DIR/skills"/*; do
    if [ -d "$skill_dir" ]; then
        skill_name=$(basename "$skill_dir")
        echo "  - $skill_name"
        if [ "$DRY_RUN" -eq 0 ]; then
            cp -r "$skill_dir" "$CLAUDE_DIR/skills/"
        fi
    fi
done

# Install agents
echo "Installing agents..."
for agent_file in "$SCRIPT_DIR/agents"/*.md; do
    if [ -f "$agent_file" ]; then
        agent_name=$(basename "$agent_file")
        echo "  - $agent_name"
        if [ "$DRY_RUN" -eq 0 ]; then
            cp "$agent_file" "$CLAUDE_DIR/agents/"
        fi
    fi
done

# Install hooks
echo "Installing hooks..."
if [ -f "$SCRIPT_DIR/hooks.json" ]; then
    if [ "$DRY_RUN" -eq 0 ]; then
        if [ -f "$CLAUDE_DIR/hooks.json" ]; then
            echo "  - Backing up existing hooks.json to hooks.json.backup"
            cp "$CLAUDE_DIR/hooks.json" "$CLAUDE_DIR/hooks.json.backup"
        fi
        cp "$SCRIPT_DIR/hooks.json" "$CLAUDE_DIR/hooks.json"
    fi
    echo "  - hooks.json (strategic-compact, continuous-learning)"
fi

if [ "$DRY_RUN" -eq 1 ]; then
    echo ""
    echo "Dry run complete. Nothing was installed."
    exit 0
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
