#!/bin/bash

# Claude Code Skills Collection Installer
# Installs skills, agents, and hooks to ~/.claude/
# Merges configuration without overwriting existing settings

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

echo "Installing Claude Code Skills Collection..."
echo ""

# Create directories if they don't exist
mkdir -p "$CLAUDE_DIR/skills"
mkdir -p "$CLAUDE_DIR/agents"
mkdir -p "$CLAUDE_DIR/hooks"

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
echo ""
echo "Installing agents..."
for agent_file in "$SCRIPT_DIR/agents"/*.md; do
    if [ -f "$agent_file" ]; then
        agent_name=$(basename "$agent_file")
        echo "  - $agent_name"
        cp "$agent_file" "$CLAUDE_DIR/agents/"
    fi
done

# Install hook scripts
echo ""
echo "Installing hook scripts..."
for hook_file in "$SCRIPT_DIR/hooks"/*; do
    if [ -f "$hook_file" ]; then
        hook_name=$(basename "$hook_file")
        echo "  - $hook_name"
        cp "$hook_file" "$CLAUDE_DIR/hooks/"
        # Make shell scripts executable
        if [[ "$hook_file" == *.sh ]]; then
            chmod +x "$CLAUDE_DIR/hooks/$hook_name"
        fi
    fi
done

# Configure hooks in settings.json
echo ""
echo "Configuring hooks..."

# Determine the correct hook script based on OS
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    CONTEXT_CHECK_CMD="$CLAUDE_DIR/hooks/context-check.cmd"
else
    CONTEXT_CHECK_CMD="$CLAUDE_DIR/hooks/context-check.sh"
fi

# Our hook configuration
HOOK_CONFIG=$(cat <<EOF
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CONTEXT_CHECK_CMD",
            "statusMessage": "Checking for saved context..."
          }
        ]
      }
    ]
  }
}
EOF
)

# Check if jq is available for JSON merging
if command -v jq &> /dev/null; then
    if [ -f "$SETTINGS_FILE" ]; then
        echo "  Merging with existing settings.json..."

        # Check if SessionStart hooks already exist
        existing_session_start=$(jq '.hooks.SessionStart // empty' "$SETTINGS_FILE" 2>/dev/null)

        if [ -n "$existing_session_start" ]; then
            echo "  Note: SessionStart hooks already exist, adding to them..."
            # Merge our hook into existing SessionStart array
            jq --argjson new_hook "$(echo "$HOOK_CONFIG" | jq '.hooks.SessionStart[0]')" \
               '.hooks.SessionStart += [$new_hook]' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
               && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
        else
            # Add hooks section, preserving other settings
            jq --argjson hooks "$(echo "$HOOK_CONFIG" | jq '.hooks')" \
               '.hooks = (.hooks // {}) * $hooks' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
               && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
        fi
    else
        echo "  Creating new settings.json..."
        echo "$HOOK_CONFIG" | jq '.' > "$SETTINGS_FILE"
    fi
    echo "  Hooks configured successfully."
else
    echo "  Warning: 'jq' not found. Cannot automatically configure hooks."
    echo ""
    echo "  Please manually add to $SETTINGS_FILE:"
    echo ""
    echo "$HOOK_CONFIG"
    echo ""
    echo "  Or install jq and re-run this script."
fi

echo ""
echo "============================================"
echo "Installation complete!"
echo "============================================"
echo ""
echo "Installed to: $CLAUDE_DIR/"
echo "  - skills/    ($(ls -1 "$CLAUDE_DIR/skills" | wc -l) skills)"
echo "  - agents/    ($(ls -1 "$CLAUDE_DIR/agents" | wc -l) agents)"
echo "  - hooks/     ($(ls -1 "$CLAUDE_DIR/hooks" | wc -l) hook scripts)"
echo ""
echo "Restart Claude Code to activate the new skills and agents."
echo ""
