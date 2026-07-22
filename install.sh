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
# Claude Code only loads hooks from settings.json's "hooks" key - a standalone
# hooks.json is never read - so merge into settings.json rather than copy.
echo "Installing hooks..."
if [ -f "$SCRIPT_DIR/hooks.json" ]; then
    if [ "$DRY_RUN" -eq 0 ]; then
        if command -v node >/dev/null 2>&1; then
            node "$SCRIPT_DIR/merge-hooks.js" "$SCRIPT_DIR/hooks.json" "$CLAUDE_DIR/settings.json"
        else
            echo "  - node not found; could not merge hooks into settings.json. Merge $SCRIPT_DIR/hooks.json's \"hooks\" key into $CLAUDE_DIR/settings.json by hand."
        fi
    fi
    echo "  - hooks merged into settings.json (tmux-dev-block, tmux-reminder, git-push-review, doc-file-warn, pr-url-logger, prettier-format, typescript-check, console-log-warn/audit, load-context)"
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
echo "Hooks merged into: $CLAUDE_DIR/settings.json (backed up first as settings.json.backup)"
echo ""
echo "Hooks configured:"
echo ""
echo "  PreToolUse (before tool execution):"
echo "    - tmux-dev-block: Block dev servers outside tmux"
echo "    - tmux-reminder: Suggest tmux for long-running commands"
echo "    - git-push-review: Reminder before git push"
echo "    - doc-file-warn: Warn about docs outside docs/ structure"
echo ""
echo "  PostToolUse (after tool execution):"
echo "    - pr-url-logger: Log PR URL after creation"
echo "    - prettier-format: Auto-format JS/TS with Prettier"
echo "    - typescript-check: Run tsc after .ts/.tsx edits"
echo "    - console-log-warn: Warn about console.log in JS/TS"
echo ""
echo "  Stop (session end):"
echo "    - console-log-audit: Audit modified files for console.log"
echo ""
echo "  SessionStart / PreCompact:"
echo "    - load-context: Detect saved context files"
echo ""
echo "  NOTE: strategic-compact and continuous-learning are NOT wired as hooks -"
echo "  a hook action can only be command/prompt/agent/http/mcp_tool, not a skill"
echo "  invocation, so there is no valid 'run this skill on this event' hook type."
echo "  Invoke /strategic-compact and /continuous-learning manually, or via a"
echo "  command/agent-type hook, until that's redesigned."
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
