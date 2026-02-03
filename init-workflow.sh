#!/bin/bash

# Claude Code Workflow Initializer
# Generates CLAUDE.md with passive context workflow enforcement
# Based on Vercel research: passive context (100%) > skill invocation (53-79%)

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
    echo "  minimal   - Core workflow rules only"
    echo "  standard  - Full workflow + quality gates (recommended)"
    echo "  strict    - Everything + orchestrator pattern + auto-triggers"
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
MARKER="## Workflow Rules"

echo -e "${BLUE}Claude Code Workflow Initializer${NC}"
echo -e "${BLUE}Using passive context enforcement (Vercel pattern)${NC}"
echo "Target: $TARGET_DIR"
echo "Level:  $LEVEL"
echo ""

# Check if workflow section already exists
if [ -f "$CLAUDE_MD" ] && grep -q "$MARKER" "$CLAUDE_MD"; then
    echo -e "${YELLOW}Warning: Workflow section already exists in CLAUDE.md${NC}"
    echo "To update, manually remove the '$MARKER' section and re-run."
    exit 0
fi

# =============================================================================
# MINIMAL: Core workflow rules - always enforced
# =============================================================================
generate_minimal() {
    cat << 'EOF'

---

## Workflow Rules (Mandatory - Always Enforced)

### Decision Matrix

| Condition | Required Action |
|-----------|-----------------|
| Single file, obvious fix | Implement directly |
| 2-3 files, clear scope | Consider `/create-plan` |
| **3+ files OR architectural** | **MUST `/create-plan` first** |

**Never implement complex features without a plan.**

### Quality Gates (ALL Blocking)

| Gate | Blocking? |
|------|-----------|
| Build compiles | **YES** |
| Types pass | **YES** |
| Lint passes | **YES** |
| Tests pass | **YES** |
| Code review = PASS | **YES** |

**PASS_WITH_NOTES is NOT acceptable.** Fix all recommendations first.

### Key Rules

- Recommendations are BLOCKING - not suggestions
- STOP after each phase - wait for human approval
- Progress via Task tools (persists across sessions)
EOF
}

# =============================================================================
# STANDARD: Full workflow + quality gates (recommended)
# =============================================================================
generate_standard() {
    cat << 'EOF'

---

## Workflow Rules (Mandatory - Always Enforced)

These rules apply to every interaction. No skill invocation required.

### Decision Matrix

| Condition | Required Action |
|-----------|-----------------|
| Single file, obvious fix | Implement directly |
| 2-3 files, clear scope | Consider `/create-plan` |
| **3+ files OR architectural** | **MUST `/create-plan` first** |

**Never implement complex features without a plan.**

### Execution Sequence

```
/brainstorm (optional) → /create-plan → /implement-plan [path]
```

### Quality Gates (ALL Blocking)

Every phase MUST pass ALL gates before completion:

| Gate | Criteria | Blocking? |
|------|----------|-----------|
| Build | Compiles without errors | **YES** |
| Types | Type checking passes | **YES** |
| Lint | No linting errors | **YES** |
| Tests | All tests pass | **YES** |
| Security | No vulnerabilities | **YES** |
| Code Review | Clean PASS only | **YES** |

**PASS_WITH_NOTES is NOT acceptable.** Fix all recommendations first.
**Recommendations are BLOCKING** - not optional suggestions.

### Coding Standards (Enforced)

| Standard | Limit | Severity |
|----------|-------|----------|
| Service file | <500 lines | **BLOCKING** |
| Controller method | <30 lines | **BLOCKING** if >50 |
| Service public methods | <12 | **BLOCKING** |
| DTOs typed | Required | **BLOCKING** |
| `console.log` | Forbidden | **BLOCKING** |
| Empty catch blocks | Forbidden | **BLOCKING** |
| Hardcoded secrets | Forbidden | **BLOCKING** |

Reference: `docs/standards/CODING_STANDARDS.md` (if exists)

### Phase Completion Rules

1. **ALL steps must execute** - no skipping
2. **STOP after each phase** - wait for human approval
3. **Recommendations are BLOCKING** - fix before proceeding
4. **Clean baseline** - each phase ends with verified, working code

---

## Task Tools Integration

Progress tracked via Task tools (persists across `/clear` and session restarts):

| Status | Meaning |
|--------|---------|
| `pending` | Not started |
| `in_progress` | Currently being worked on |
| `completed` | Done and verified |

Dependencies via `blockedBy` auto-unblock when parent completes.

### Session Management

```bash
claude --resume "feature-name"    # Resume named session
claude --from-pr 123              # Resume by PR number
```

---

## Skill Reference

| Skill | Purpose | Arguments |
|-------|---------|-----------|
| `/brainstorm` | Refine ideas | `[topic]` |
| `/create-plan` | Design implementation | `[description]` |
| `/implement-plan` | Execute plan | `[path]` |
| `/verification-loop` | Run quality checks | |
| `/code-review` | Review quality | |
| `/security-review` | Security audit | |
| `/adr` | Document decision | `[title]` |
EOF
}

# =============================================================================
# STRICT: Everything + orchestrator pattern + auto-triggers
# =============================================================================
generate_strict() {
    cat << 'EOF'

---

## Workflow Rules (Mandatory - Always Enforced)

These rules apply to every interaction. No skill invocation required.

### Decision Matrix

| Condition | Required Action |
|-----------|-----------------|
| Single file, obvious fix | Implement directly |
| 2-3 files, clear scope | Consider `/create-plan` |
| **3+ files OR architectural** | **MUST `/create-plan` first** |

**Never implement complex features without a plan.**

### Execution Sequence

```
/brainstorm (optional) → /create-plan → /implement-plan [path]
```

### Quality Gates (ALL Blocking)

Every phase MUST pass ALL gates before completion:

| Gate | Criteria | Blocking? |
|------|----------|-----------|
| Build | Compiles without errors | **YES** |
| Types | Type checking passes | **YES** |
| Lint | No linting errors | **YES** |
| Tests | All tests pass | **YES** |
| Security | No vulnerabilities | **YES** |
| Code Review | Clean PASS only | **YES** |

**PASS_WITH_NOTES is NOT acceptable.** Fix all recommendations first.
**Recommendations are BLOCKING** - not optional suggestions.

### Coding Standards (Enforced)

| Standard | Limit | Severity |
|----------|-------|----------|
| Service file | <500 lines | **BLOCKING** |
| Controller method | <30 lines | **BLOCKING** if >50 |
| Service public methods | <12 | **BLOCKING** |
| DTOs typed | Required | **BLOCKING** |
| `console.log` | Forbidden | **BLOCKING** |
| Empty catch blocks | Forbidden | **BLOCKING** |
| Hardcoded secrets | Forbidden | **BLOCKING** |

Reference: `docs/standards/CODING_STANDARDS.md` (if exists)

### Orchestrator Pattern (Enforced)

```
implement-plan / implement-phase (ORCHESTRATORS)
    ⛔ NEVER use Write/Edit tools directly
    ⛔ NEVER write code
    ✅ Delegate to subagents via Task tool
    ✅ Track progress via Task tools

Subagents (WORKERS)
    ✅ Write code
    ✅ Run verification
    ✅ Return concise status (not 300+ lines)
```

### Subagent Response Format

```
STATUS: PASS | FAIL
FILES: path/file.ts (created|modified|deleted)
ERRORS: None | [description]
```

Large outputs → `logs/` directory, return file path only.

### Phase Completion Rules

1. **ALL steps must execute** - no skipping
2. **STOP after each phase** - wait for human approval
3. **Recommendations are BLOCKING** - fix before proceeding
4. **Clean baseline** - each phase ends with verified, working code

---

## Auto-Triggers (Mandatory)

### Security Review

Invoke `/security-review` when implementing ANY of:
- Authentication / authorization
- User input handling / validation
- API endpoints (especially public)
- Secrets / credentials / API keys
- Payment processing
- File uploads
- Database queries with user input

### ADR Creation

Invoke `/adr [title]` when:
- Choosing between technologies or approaches
- Establishing new patterns or conventions
- Making trade-offs with significant implications
- Making decisions future developers will question

---

## Task Tools Integration

Progress tracked via Task tools (persists across `/clear` and session restarts):

| Status | Meaning |
|--------|---------|
| `pending` | Not started |
| `in_progress` | Currently being worked on |
| `completed` | Done and verified |

Dependencies via `blockedBy` auto-unblock when parent completes.

### Session Management

```bash
claude --resume "feature-name"    # Resume named session
claude --from-pr 123              # Resume by PR number
```

---

## Directory Structure

```
docs/
├── plans/          # YYYY-MM-DD-feature.md
├── decisions/      # ADR-NNNN-title.md
└── brainstorms/    # YYYY-MM-DD-topic.md
logs/               # Large outputs (gitignored)
```

---

## Skill Reference

| Skill | Purpose | Arguments |
|-------|---------|-----------|
| `/brainstorm` | Refine ideas through questioning | `[topic]` |
| `/create-plan` | Design phased implementation | `[description]` |
| `/implement-plan` | Execute a plan | `[path/to/plan.md]` |
| `/verification-loop` | Run all 6 quality checks | |
| `/code-review` | Review code quality | |
| `/security-review` | Security audit | |
| `/adr` | Document architectural decision | `[title]` |
EOF
}

# Create directories structure
echo -e "${GREEN}Creating directory structure...${NC}"
mkdir -p "$TARGET_DIR/docs/plans"
mkdir -p "$TARGET_DIR/docs/brainstorms"
mkdir -p "$TARGET_DIR/docs/decisions"
mkdir -p "$TARGET_DIR/logs"
echo "  - docs/plans/"
echo "  - docs/brainstorms/"
echo "  - docs/decisions/"
echo "  - logs/"

# Add .gitkeep files to empty directories
touch "$TARGET_DIR/docs/plans/.gitkeep" 2>/dev/null || true
touch "$TARGET_DIR/docs/brainstorms/.gitkeep" 2>/dev/null || true
touch "$TARGET_DIR/docs/decisions/.gitkeep" 2>/dev/null || true
touch "$TARGET_DIR/logs/.gitkeep" 2>/dev/null || true

# Add logs to .gitignore if not already there
if [ -f "$TARGET_DIR/.gitignore" ]; then
    if ! grep -q "^logs/$" "$TARGET_DIR/.gitignore"; then
        echo "" >> "$TARGET_DIR/.gitignore"
        echo "# Claude Code workflow logs" >> "$TARGET_DIR/.gitignore"
        echo "logs/" >> "$TARGET_DIR/.gitignore"
        echo -e "${GREEN}Added logs/ to .gitignore${NC}"
    fi
else
    echo "logs/" > "$TARGET_DIR/.gitignore"
    echo -e "${GREEN}Created .gitignore with logs/${NC}"
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
    PROJECT_NAME=$(basename "$TARGET_DIR")
    cat > "$CLAUDE_MD" << EOF
# $PROJECT_NAME

## Overview

[Brief project description]

## Tech Stack

- [Primary language/framework]
- [Key dependencies]

## Project Structure

\`\`\`
src/
docs/
  plans/       # Implementation plans (YYYY-MM-DD-name.md)
  decisions/   # ADRs (ADR-NNNN-title.md)
  brainstorms/ # Ideation documents
logs/          # Workflow outputs (gitignored)
\`\`\`

## Build Commands

\`\`\`bash
npm run build        # Build
npm run typecheck    # Type check
npm run lint         # Lint
npm test             # Tests
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
echo -e "${BLUE}Passive Context Enforcement Active${NC}"
echo "The workflow rules are now embedded in CLAUDE.md and will be"
echo "automatically loaded every turn - no skill invocation required."
echo ""
echo "Next steps:"
echo "  1. Review/customize $CLAUDE_MD"
echo "  2. Update Overview, Tech Stack, Build Commands sections"
echo "  3. Start using the workflow:"
echo ""
echo "     /brainstorm              - Refine ideas"
echo "     /create-plan             - Design implementation"
echo "     /implement-plan [path]   - Execute plan"
echo ""
