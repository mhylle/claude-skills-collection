#!/bin/bash

# Claude Code Workflow Initializer
# Adds skill workflow enforcement to a project's CLAUDE.md
# Non-destructive: appends to existing files, never overwrites

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-.}"
LEVEL="${2:-standard}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_usage() {
    echo "Usage: $0 [project-dir] [level]"
    echo ""
    echo "Arguments:"
    echo "  project-dir  Target project directory (default: current directory)"
    echo "  level        Enforcement level: minimal, standard, strict (default: standard)"
    echo ""
    echo "Examples:"
    echo "  $0                           # Initialize current directory with standard level"
    echo "  $0 ~/projects/myapp          # Initialize specific project"
    echo "  $0 . minimal                 # Use minimal enforcement"
    echo "  $0 ~/projects/myapp strict   # Use strict enforcement"
    echo ""
    echo "Levels:"
    echo "  minimal   - Brief execution rules (4 lines)"
    echo "  standard  - 8-step pipeline + verification table (recommended)"
    echo "  strict    - Full enforcement with orchestrator pattern + flow diagram"
}

# Check for help flag
if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    print_usage
    exit 0
fi

# Validate level
if [[ "$LEVEL" != "minimal" ]] && [[ "$LEVEL" != "standard" ]] && [[ "$LEVEL" != "strict" ]]; then
    echo -e "${RED}Error: Invalid level '$LEVEL'. Use: minimal, standard, or strict${NC}"
    print_usage
    exit 1
fi

# Resolve target directory
TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd)" || {
    echo -e "${RED}Error: Directory '$1' does not exist${NC}"
    exit 1
}

CLAUDE_MD="$TARGET_DIR/CLAUDE.md"
MARKER="## Skill-Based Development Workflow"

echo -e "${BLUE}Claude Code Workflow Initializer${NC}"
echo "Target: $TARGET_DIR"
echo "Level:  $LEVEL"
echo ""

# Check if workflow section already exists
if [ -f "$CLAUDE_MD" ] && grep -q "$MARKER" "$CLAUDE_MD"; then
    echo -e "${YELLOW}Warning: Workflow section already exists in CLAUDE.md${NC}"
    echo "To update, manually remove the '$MARKER' section and re-run."
    exit 0
fi

# Generate snippet based on level
generate_minimal() {
    cat << 'EOF'

---

## Implementation Workflow

When `/implement-plan` is invoked:
- Execute each phase through all 8 steps (no skipping)
- **STOP after each phase** for human validation before proceeding
- All quality gates must PASS - recommendations are blocking
- Never write code directly - delegate to subagents
EOF
}

generate_standard() {
    cat << 'EOF'

---

## Implementation Workflow

When `/implement-plan` is invoked, follow this workflow strictly.

### Phase Execution

For each phase, `/implement-phase` executes these 8 steps in order:

| Step | Name | Description |
|------|------|-------------|
| 1 | **Implementation** | Subagents write code (orchestrator never writes directly) |
| 2 | **Verification** | Run verification-loop: build, types, lint, tests, security, diff |
| 3 | **Integration Testing** | Test via API calls or Playwright UI verification |
| 4 | **Code Review** | Must achieve PASS (not PASS_WITH_NOTES) |
| 5 | **ADR Compliance** | Verify adherence to architectural decisions |
| 6 | **Plan Sync** | Confirm all phase tasks completed |
| 7 | **Prompt Archive** | Move phase prompt to completed/ |
| 8 | **Completion** | Report status to orchestrator |

**ALL steps must pass before phase is complete.**

### Critical Rules

1. **STOP after each phase** - Wait for human validation before starting next phase
2. **Recommendations are BLOCKING** - Fix all code review recommendations before proceeding
3. **No skipping steps** - Every step must execute and pass
4. **Orchestrator pattern** - implement-plan/implement-phase delegate work, never write code directly

### Verification Checks (Step 2)

All must pass:
- Build compiles without errors
- Type checking passes
- Linting passes
- All tests pass
- No security issues detected
- Diff review confirms minimal, focused changes

### Code Review (Step 4)

- Must achieve PASS (not PASS_WITH_NOTES)
- **Recommendations are BLOCKING** - address before phase completion
EOF
}

generate_strict() {
    cat << 'EOF'

---

## Implementation Workflow

When `/implement-plan` is invoked, follow this workflow strictly.

### Execution Flow

```
implement-plan (orchestrator)
    │
    ├─► Phase 1 ─► implement-phase ─► 8 steps ─► STOP for human validation
    │
    ├─► Phase 2 ─► implement-phase ─► 8 steps ─► STOP for human validation
    │
    └─► Phase N ─► implement-phase ─► 8 steps ─► COMPLETE
```

### The 8 Steps (Per Phase)

Each phase executes ALL steps in order. No skipping.

| Step | Name | What Happens | Exit Criteria |
|------|------|--------------|---------------|
| 1 | **Implementation** | Subagents write code | Code complete |
| 2 | **Verification** | 6-check verification loop | All 6 pass |
| 3 | **Integration Testing** | API/UI tests via Playwright | Tests pass |
| 4 | **Code Review** | Quality + pattern review | Clean PASS |
| 5 | **ADR Compliance** | Check architectural decisions | Compliant |
| 6 | **Plan Sync** | Verify phase tasks done | Synced |
| 7 | **Prompt Archive** | Move prompt to completed/ | Archived |
| 8 | **Completion** | Report to orchestrator | Reported |

### Verification Loop (Step 2) - 6 Checks

All must pass:
- Build compiles without errors
- Type checking passes
- Linting passes
- All tests pass
- No security issues detected
- Diff review confirms minimal, focused changes

### Code Review (Step 4)

- Must achieve PASS (not PASS_WITH_NOTES)
- **Recommendations are BLOCKING** - address before phase completion

### Critical Rules

1. **STOP AFTER EACH PHASE**
   - Do NOT auto-continue to next phase
   - Wait for explicit human approval
   - Report: "Phase N complete. Awaiting approval to proceed."

2. **RECOMMENDATIONS ARE BLOCKING**
   - Code review PASS_WITH_NOTES is NOT acceptable
   - Fix ALL recommendations before phase completion
   - Re-run code review until clean PASS

3. **ORCHESTRATOR PATTERN**
   - implement-plan: orchestrates phases, NEVER writes code
   - implement-phase: orchestrates steps, NEVER writes code
   - Subagents: write code, run tests, return concise status

4. **CLEAN BASELINE**
   - Each phase ends with working, verified code
   - All errors introduced during phase must be fixed
   - Next phase inherits clean state

### Subagent Response Format

Subagents must return concise status:
```
STATUS: PASS | FAIL
FILES: [list of modified files]
ERRORS: [any errors, or "None"]
```

Large outputs (logs, traces) → write to `logs/` directory
EOF
}

# Create directories structure
echo -e "${GREEN}Creating directory structure...${NC}"
mkdir -p "$TARGET_DIR/docs/plans"
mkdir -p "$TARGET_DIR/docs/brainstorms"
mkdir -p "$TARGET_DIR/docs/adr"
mkdir -p "$TARGET_DIR/logs"
echo "  - docs/plans/"
echo "  - docs/brainstorms/"
echo "  - docs/adr/"
echo "  - logs/"

# Add .gitkeep files to empty directories
touch "$TARGET_DIR/docs/plans/.gitkeep" 2>/dev/null || true
touch "$TARGET_DIR/docs/brainstorms/.gitkeep" 2>/dev/null || true
touch "$TARGET_DIR/docs/adr/.gitkeep" 2>/dev/null || true
touch "$TARGET_DIR/logs/.gitkeep" 2>/dev/null || true

# Add logs to .gitignore if not already there
if [ -f "$TARGET_DIR/.gitignore" ]; then
    if ! grep -q "^logs/$" "$TARGET_DIR/.gitignore"; then
        echo "" >> "$TARGET_DIR/.gitignore"
        echo "# Claude Code logs" >> "$TARGET_DIR/.gitignore"
        echo "logs/" >> "$TARGET_DIR/.gitignore"
        echo -e "${GREEN}Added logs/ to .gitignore${NC}"
    fi
fi

# Handle CLAUDE.md
if [ -f "$CLAUDE_MD" ]; then
    echo -e "${GREEN}Appending workflow section to existing CLAUDE.md...${NC}"

    # Create backup
    cp "$CLAUDE_MD" "$CLAUDE_MD.backup"
    echo "  - Backup created: CLAUDE.md.backup"

    # Append based on level
    case "$LEVEL" in
        minimal)
            generate_minimal >> "$CLAUDE_MD"
            ;;
        standard)
            generate_standard >> "$CLAUDE_MD"
            ;;
        strict)
            generate_strict >> "$CLAUDE_MD"
            ;;
    esac
    echo "  - Appended $LEVEL workflow section"
else
    echo -e "${GREEN}Creating new CLAUDE.md...${NC}"

    # Create header + workflow section
    cat > "$CLAUDE_MD" << EOF
# $(basename "$TARGET_DIR")

## Overview

[Project description]

## Tech Stack

[Technologies used]

## Project Structure

\`\`\`
src/
docs/
  plans/       # Implementation plans
  brainstorms/ # Ideation documents
  adr/         # Architectural decision records
logs/          # Build/test output logs
\`\`\`
EOF

    # Append workflow section based on level
    case "$LEVEL" in
        minimal)
            generate_minimal >> "$CLAUDE_MD"
            ;;
        standard)
            generate_standard >> "$CLAUDE_MD"
            ;;
        strict)
            generate_strict >> "$CLAUDE_MD"
            ;;
    esac
    echo "  - Created with $LEVEL workflow section"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review/customize $CLAUDE_MD"
echo "  2. Update the Overview, Tech Stack, and Project Structure sections"
echo "  3. Adjust build commands in Quality Gates table if needed"
echo ""
echo "Quick reference:"
echo "  /brainstorm              - Refine ideas"
echo "  /create-plan             - Design implementation"
echo "  /implement-plan [path]   - Execute plan"
echo "  /adr [title]             - Document decisions"
