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
echo "  - PreToolUse: strategic-compact (monitors session complexity)"
echo "  - Stop: continuous-learning (extracts patterns on exit)"
echo ""
echo "Restart Claude Code to activate the new skills, agents, and hooks."
