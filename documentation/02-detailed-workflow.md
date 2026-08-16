# Detailed Implementation Workflow

A comprehensive guide explaining each step of the workflow and the reasoning behind it.

## Table of Contents

1. [The Workflow Philosophy](#the-workflow-philosophy)
2. [Phase 1: Brainstorming](#phase-1-brainstorming)
3. [Phase 1.5: Requirements & Decisions](#phase-15-requirements--decisions-optional)
4. [Phase 2: Planning](#phase-2-planning)
4. [Phase 3: Implementation](#phase-3-implementation)
5. [Phase 4: The Clear-and-Continue Pattern](#phase-4-the-clear-and-continue-pattern)
6. [Understanding Quality Gates](#understanding-quality-gates)
7. [Progress Tracking Deep Dive](#progress-tracking-deep-dive)
8. [Continuous Learning System](#continuous-learning-system)
9. [Hooks and Automation](#hooks-and-automation)
10. [Skill Architecture (Claude Code 2.1.x)](#skill-architecture-claude-code-21x)
11. [Plugin Distribution](03-plugin-distribution.md)

---

## The Workflow Philosophy

### Why This Workflow Exists

Traditional AI-assisted coding often suffers from:

| Problem | Symptom | Our Solution |
|---------|---------|--------------|
| **Context bloat** | AI gets confused after long sessions | Clear between phases |
| **Lost progress** | Have to restart after clearing | Task tools persist progress |
| **Forgotten learnings** | Same mistakes repeated | Continuous learning captures patterns |
| **Quality drift** | Code quality degrades over time | Quality gates on every phase |
| **Unclear requirements** | Building the wrong thing | Brainstorm before planning |

### The Core Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE PRINCIPLES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ORCHESTRATION OVER IMPLEMENTATION                                        │
│     ├── Claude coordinates, subagents execute                               │
│     └── Never write code directly in the main session                       │
│                                                                              │
│  2. CLEAN BASELINE PRINCIPLE                                                 │
│     ├── Every phase ends clean (all checks pass)                            │
│     └── Next phase inherits a working codebase                              │
│                                                                              │
│  3. PERSISTENT PROGRESS                                                      │
│     ├── Task tools survive /clear and session restarts                      │
│     └── Plan files remain pure specifications                               │
│                                                                              │
│  4. CAPTURED KNOWLEDGE                                                       │
│     ├── Learnings extracted at natural boundaries                           │
│     └── Patterns available for future sessions                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Brainstorming

Two skills are available depending on the depth needed:

| Skill | Method | Best For | Token Cost |
|-------|--------|----------|------------|
| `/brainstorm` | Single agent applies all frameworks serially | Quick ideas, straightforward concepts | ~8-12K |
| `/team-brainstorm` | Agent team with adversarial debate | Critical decisions, high-stakes ideas | ~25-40K |

### /brainstorm Flow (Single Agent)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BRAINSTORM FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You: "I want to add user authentication"                                   │
│                                                                              │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PHASE 1: Idea Capture                                                │   │
│  │ • What is the core concept?                                          │   │
│  │ • What are the stated goals?                                         │   │
│  │ • Is there project context?                                          │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PHASE 2: Socratic Clarification                                      │   │
│  │ • Scope: "What's in scope? What's explicitly out?"                   │   │
│  │ • Assumptions: "What are we taking for granted?"                     │   │
│  │ • Alternatives: "What other approaches exist?"                       │   │
│  │ • Consequences: "What happens if this succeeds/fails?"               │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PHASE 3: Context Gathering                                           │   │
│  │ • Web research for best practices                                    │   │
│  │ • Codebase research for existing patterns                            │   │
│  │ • Documentation analysis                                              │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PHASE 4-5: Analysis & Synthesis                                      │   │
│  │ • Six Thinking Hats (facts, risks, benefits, creativity)            │   │
│  │ • SCAMPER enhancement                                                │   │
│  │ • Premortem analysis                                                 │   │
│  │ • Key decisions documented as ADRs                                   │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  Output: docs/brainstorms/2026-01-25-user-auth.md                          │
│          + ADR documents for key decisions                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### /team-brainstorm Flow (Agent Team)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TEAM BRAINSTORM FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PHASE 1-2: Idea Capture + Socratic Clarification (Lead-driven)            │
│  Same as single-agent brainstorm — clarify before spawning team            │
│                                                                              │
│  PHASE 3: Team Creation & Research                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Lead spawns teammates:                                              │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐     │   │
│  │  │   Devil's   │  │ Optimist │  │ Creative  │  │ Researcher │     │   │
│  │  │  Advocate   │  │          │  │ Explorer  │  │            │     │   │
│  │  └──────┬──────┘  └────┬─────┘  └─────┬─────┘  └─────┬──────┘     │   │
│  │         │              │              │              │             │   │
│  │         └──────┬───────┴──────┬───────┴──────┬───────┘             │   │
│  │                │              │              │                      │   │
│  │                ▼              ▼              ▼                      │   │
│  │         Teammates message each other to debate:                    │   │
│  │         • Devil's Advocate challenges Optimist                     │   │
│  │         • Researcher shares evidence with all                      │   │
│  │         • Creative Explorer proposes alternatives                  │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│  PHASE 4-5: Synthesis & Debate Resolution (Lead)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • Where teammates agreed vs disagreed                               │   │
│  │ • Strengths that survived adversarial scrutiny                      │   │
│  │ • Risks the Optimist couldn't mitigate                              │   │
│  │ • Best alternatives addressing top concerns                        │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  Output: docs/brainstorms/2026-01-25-user-auth-team.md                     │
│          + ADR documents + team shutdown + cleanup                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Brainstorm?

| Without Brainstorming | With Brainstorming |
|-----------------------|---------------------|
| Jump straight to code | Clarify requirements first |
| Discover issues during implementation | Discover issues before writing code |
| Build, then realize it's wrong | Validate approach upfront |
| No documentation of reasoning | ADRs capture why decisions were made |

### When to Use Which

| Situation | Recommendation |
|-----------|---------------|
| Quick idea, low stakes | `/brainstorm` |
| Critical architecture decision | `/team-brainstorm` |
| Bug fix or small change | Skip brainstorming |
| Complex feature with trade-offs | `/team-brainstorm` |
| Requirements are crystal clear | Skip or `/brainstorm` |

---

## Phase 1.5: Requirements & Decisions (Optional)

After brainstorming, two parallel activities formalize the output:

### User Stories (`/user-story`)

Generates hierarchical requirements from brainstorm output or standalone input:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER STORY FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input: Brainstorm file (auto-detected or explicit) or standalone           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 1: Input Detection                                              │   │
│  │ • Check for brainstorm file argument                                │   │
│  │ • Auto-scan docs/brainstorms/ for recent files                     │   │
│  │ • Or proceed to standalone clarification                           │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 2-3: Context Gathering + Clarification                         │   │
│  │ • Read brainstorm, ADRs, existing stories                          │   │
│  │ • Socratic questioning (standalone mode)                           │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 4: Story Generation                                            │   │
│  │ • Identify epics (major capabilities)                              │   │
│  │ • Decompose into features (max 5 per epic)                         │   │
│  │ • Decompose into tasks (max 5 per feature)                         │   │
│  │ • Write Given/When/Then acceptance criteria                        │   │
│  │ • Add exit conditions in shared create-plan format                 │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  Output: docs/user-stories/EPIC-01-slug.md (one file per epic)            │
│          docs/user-stories/INDEX.md (master overview)                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hierarchy

| Level | Format | Represents | Example |
|-------|--------|-----------|---------|
| Epic | `EPIC-01` | Major capability | User Authentication |
| Feature | `EPIC-01.F-01` | Deliverable function | Password Reset Flow |
| Task | `EPIC-01.F-01.T-01` | Implementable unit | Email Validation |

### Integration with Create-Plan

Task-level stories share the same structure as create-plan phases (Objective, Tasks, Exit Conditions). This means:
- No translation step when moving from stories to plan
- Given/When/Then acceptance criteria become exit conditions
- Story IDs provide traceability from requirements to implementation

### When to Use

| Situation | Recommendation |
|-----------|---------------|
| After brainstorm, before planning | `/user-story` (recommended) |
| Well-understood requirements | Skip user stories |
| Formal project with traceability needs | `/user-story` (strongly recommended) |
| Quick bug fix or small feature | Skip user stories |

---

## Phase 2: Planning

### What Happens

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CREATE-PLAN FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Research the Codebase                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Parallel research agents:                                            │   │
│  │ • codebase-locator: Find relevant files                             │   │
│  │ • codebase-analyzer: Understand existing patterns                   │   │
│  │ • codebase-pattern-finder: Find similar implementations             │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  STEP 2: Present Understanding                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • Here's what I found in the codebase...                            │   │
│  │ • These patterns exist...                                            │   │
│  │ • I have these questions...                                          │   │
│  │                                                                      │   │
│  │ [Wait for your confirmation before proceeding]                       │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  STEP 3: Research Corrections (if any)                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • You said X, let me verify...                                       │   │
│  │ • Cross-reference with codebase                                      │   │
│  │ • Resolve conflicts between user input and reality                   │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  STEP 4: Design Options                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Option A: [Approach]                                                 │   │
│  │   Pros: ...  Cons: ...                                              │   │
│  │                                                                      │   │
│  │ Option B: [Alternative]                                              │   │
│  │   Pros: ...  Cons: ...                                              │   │
│  │                                                                      │   │
│  │ Recommendation: Option A because...                                  │   │
│  │                                                                      │   │
│  │ [Wait for your approval → Create ADR]                                │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  STEP 5: Phase Structure                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Proposed phases:                                                     │   │
│  │   Phase 1: Database Schema                                           │   │
│  │   Phase 2: Auth Service                                              │   │
│  │   Phase 3: API Endpoints                                             │   │
│  │   Phase 4: Testing                                                   │   │
│  │                                                                      │   │
│  │ [Wait for your approval]                                             │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  STEP 6: Write Plan                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Output: docs/plans/2026-01-25-user-auth.md                          │   │
│  │                                                                      │   │
│  │ Contains:                                                            │   │
│  │ • Overview and context                                               │   │
│  │ • Design decision + ADR reference                                    │   │
│  │ • Phased implementation with tasks                                   │   │
│  │ • Exit conditions for each phase                                     │   │
│  │ • Dependencies and risks                                             │   │
│  └──────────────────────────────────────┬──────────────────────────────┘   │
│                                         │                                    │
│                                         ▼                                    │
│  STEP 7: Bootstrap Tasks                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ TaskCreate for each phase with dependencies:                         │   │
│  │                                                                      │   │
│  │   ◻ #1 Phase 1: Database Schema                                     │   │
│  │   ◻ #2 Phase 2: Auth Service › blocked by #1                        │   │
│  │   ◻ #3 Phase 3: API Endpoints › blocked by #2                       │   │
│  │   ◻ #4 Phase 4: Testing › blocked by #3                             │   │
│  │                                                                      │   │
│  │ task_list_id added to plan metadata                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Break Into Phases?

| Monolithic Approach | Phased Approach |
|--------------------|-----------------|
| Big bang delivery | Incremental progress |
| All-or-nothing | Each phase independently valuable |
| Hard to verify | Verify after each phase |
| Difficult rollback | Easy to pause or revert |
| Context overload | Fresh context per phase |

### Exit Conditions Are Critical

Each phase MUST define:

```markdown
**Exit Conditions**:

Build Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes

Runtime Verification:
- [ ] Application starts without errors
- [ ] No console errors on load

Functional Verification:
- [ ] `npm test` passes
- [ ] New endpoints return expected responses
```

**Why?** Exit conditions are gates. If they don't pass, the phase isn't complete. This prevents "it works on my machine" and ensures each phase leaves a clean baseline.

---

## Phase 3: Implementation

### The Orchestrator Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR HIERARCHY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  implement-plan (ORCHESTRATOR)                                              │
│  │                                                                           │
│  │  ⛔ NEVER writes code                                                    │
│  │  ⛔ NEVER uses Write/Edit tools                                          │
│  │  ✅ Coordinates phases                                                   │
│  │  ✅ Tracks overall progress                                              │
│  │                                                                           │
│  └──► implement-phase (ORCHESTRATOR)                                        │
│       │                                                                      │
│       │  ⛔ NEVER writes code                                               │
│       │  ⛔ NEVER uses Write/Edit tools                                     │
│       │  ✅ Coordinates steps within phase                                  │
│       │  ✅ Invokes quality gate skills                                     │
│       │                                                                      │
│       └──► Subagents (WORKERS)                                              │
│            │                                                                 │
│            │  ✅ Write code                                                 │
│            │  ✅ Create/modify files                                        │
│            │  ✅ Run tests                                                  │
│            │  ✅ Fix issues                                                 │
│            │                                                                 │
│            └──► Return concise results                                      │
│                 STATUS: PASS/FAIL                                           │
│                 FILES: created/modified                                     │
│                 ERRORS: if any                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why Orchestration?**

1. **Context Preservation**: Main session keeps the full plan context
2. **Parallelization**: Independent tasks run concurrently
3. **Clean Separation**: Orchestration logic separate from implementation
4. **Better Errors**: Failures don't pollute main context

### The 8-Step Phase Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENT-PHASE PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: IMPLEMENTATION                                                      │
│  ├── Spawn subagents to write tests (verification-first)                   │
│  ├── Spawn subagents to write implementation                               │
│  └── Collect results: files created, tests passing                         │
│       │                                                                      │
│       ▼ PASS → Continue (FAIL → Fix and retry)                             │
│                                                                              │
│  Step 2: VERIFICATION-LOOP (6 phases)                                       │
│  ├── Build: Compilation, bundling                                          │
│  ├── Type: Type checking, interface compliance                             │
│  ├── Lint: Code style, static analysis                                     │
│  ├── Test: Unit tests, integration tests                                   │
│  ├── Security: Dependency audit, secret scanning                           │
│  └── Diff: Review changes, detect unintended modifications                 │
│       │                                                                      │
│       ▼ ALL 6 PASS → Continue (ANY FAIL → Fix and retry)                   │
│                                                                              │
│  Step 3: INTEGRATION TESTING                                                 │
│  ├── Claude tests the feature (not you!)                                   │
│  ├── API tests: Make HTTP requests, verify responses                       │
│  ├── UI tests: browser-verification-agent with screenshots                 │
│  └── Capture evidence in logs/                                              │
│       │                                                                      │
│       ▼ PASS → Continue                                                     │
│                                                                              │
│  Step 4: CODE REVIEW                                                         │
│  ├── Invoke code-review skill                                              │
│  ├── Check: Service delegation, framework standards, ADR compliance        │
│  ├── PASS_WITH_NOTES? → Fix notes, re-run (must achieve clean PASS)        │
│  ├── Optional: security-review for sensitive code                          │
│  └── Optional: adversarial-reviewer when code-review was clean but you     │
│      want a second-opinion hostile-persona pass (Saboteur / New Hire /     │
│      Security Auditor) via isolated subagents                              │
│       │                                                                      │
│       ▼ PASS → Continue                                                     │
│                                                                              │
│  Step 5: ADR COMPLIANCE                                                      │
│  ├── Check against existing ADRs                                           │
│  └── Document new decisions if any                                          │
│       │                                                                      │
│       ▼ PASS → Continue                                                     │
│                                                                              │
│  Step 6: PLAN SYNC                                                           │
│  ├── Verify work items completed                                           │
│  └── Update task status                                                     │
│       │                                                                      │
│       ▼ PASS → Continue                                                     │
│                                                                              │
│  Step 7: PROMPT ARCHIVAL                                                     │
│  └── Move used prompt to completed/                                         │
│       │                                                                      │
│       ▼ PASS/SKIP → Continue                                                │
│                                                                              │
│  Step 8: COMPLETION REPORT                                                   │
│  ├── Generate summary                                                       │
│  ├── Invoke continuous-learning (capture patterns)                         │
│  └── Present to user                                                        │
│       │                                                                      │
│       ▼ 🛑 STOP - Await user confirmation                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Each Step Matters

| Step | What It Catches | Without It |
|------|-----------------|------------|
| 1. Implementation | - | No code gets written |
| 2. Verification | Broken code, type errors, lint issues | Ship broken code |
| 3. Integration Testing | "Works" but doesn't actually work | False confidence |
| 4. Code Review | Pattern violations, tech debt | Quality degrades |
| 5. ADR Compliance | Undocumented decisions | Future confusion |
| 6. Plan Sync | Missed work items | Incomplete features |
| 7. Prompt Archival | Prompt reuse confusion | Accidental re-runs |
| 8. Completion + Learning | Lost knowledge | Repeated mistakes |

---

## Phase 4: The Clear-and-Continue Pattern

### Your Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CLEAR-AND-CONTINUE WORKFLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SESSION 1                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ /implement-plan docs/plans/my-feature.md                            │   │
│  │                                                                      │   │
│  │ TaskList shows:                                                      │   │
│  │   ◻ #1 Phase 1: Setup                                               │   │
│  │   ◻ #2 Phase 2: Core Logic › blocked by #1                          │   │
│  │   ◻ #3 Phase 3: Integration › blocked by #2                         │   │
│  │                                                                      │   │
│  │ Executing Phase 1...                                                 │   │
│  │ ✅ Step 1-8 complete                                                 │   │
│  │ Learnings captured ✅                                                │   │
│  │                                                                      │   │
│  │ TaskList now shows:                                                  │   │
│  │   ✓ #1 Phase 1: Setup                                               │   │
│  │   ◻ #2 Phase 2: Core Logic (unblocked!)                             │   │
│  │   ◻ #3 Phase 3: Integration › blocked by #2                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                      │
│       ▼                                                                      │
│  /clear                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Context cleared, fresh start                                         │   │
│  │ BUT: Tasks persist on filesystem                                     │   │
│  │ AND: Learnings saved to ~/.claude/skills/learned/                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                      │
│       ▼                                                                      │
│  SESSION 2 (or continued session after /clear)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ /implement-plan docs/plans/my-feature.md                            │   │
│  │                                                                      │   │
│  │ TaskList shows current progress:                                     │   │
│  │   ✓ #1 Phase 1: Setup (already done!)                               │   │
│  │   ◻ #2 Phase 2: Core Logic                                          │   │
│  │   ◻ #3 Phase 3: Integration › blocked by #2                         │   │
│  │                                                                      │   │
│  │ Resuming from Phase 2...                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Repeat until all phases complete                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Clear Between Phases?

| Benefit | Explanation |
|---------|-------------|
| **Fresh context** | Each phase gets full attention without accumulated noise |
| **No confusion** | Claude doesn't mix up Phase 1 and Phase 2 code |
| **Faster responses** | Less context = faster processing |
| **Cleaner errors** | Errors are clearly from current phase |

### What Persists Across /clear

| Persists | Doesn't Persist |
|----------|-----------------|
| Task status (TaskList) | Conversation history |
| Learned patterns | Temporary mental context |
| Committed code | Uncommitted changes |
| Plan files | In-progress explanations |

---

## Understanding Quality Gates

### The Clean Baseline Principle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLEAN BASELINE PRINCIPLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Previous Phase ────► Exit Conditions PASS ────► Clean State                │
│                                                        │                     │
│                                                        ▼                     │
│                                            Current Phase Implementation      │
│                                                        │                     │
│                                                        ▼                     │
│                                            Code Review ◄── ANY errors here  │
│                                                        │   are from THIS    │
│                                                        │   phase            │
│                                                        ▼                     │
│                                            ALL errors are blocking          │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  IMPLICATION: There is no "pre-existing error" exception.                   │
│                                                                              │
│  • If lint passed before this phase, any lint errors now = we caused them  │
│  • If build passed before, any build errors now = we caused them           │
│  • If tests passed before, any test failures now = we caused them          │
│                                                                              │
│  Even errors in UNCHANGED files are our responsibility:                     │
│  • We changed types.ts                                                      │
│  • endpoints.ts (unchanged) now has type errors                             │
│  • → We broke endpoints.ts by changing types it depends on                  │
│  • → This is BLOCKING, we must fix it                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Recommendations Are Blocking

```
❌ WRONG THINKING:
   "It's just a recommendation, we can fix it later"
   "PASS_WITH_NOTES is good enough"
   "We'll address it in the next phase"

✅ CORRECT THINKING:
   "Recommendations are blocking issues"
   "Only clean PASS allows phase completion"
   "Fix it now or the phase cannot complete"
```

**Rationale**:
- Recommendations indicate real issues (pattern violations, missing tests)
- Leaving them unfixed accumulates technical debt
- Each phase that ignores recommendations makes the next phase harder
- If it's worth noting, it's worth fixing

---

## Progress Tracking Deep Dive

### Task Tools vs. Checkboxes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OLD WAY vs. NEW WAY                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OLD: Checkbox-based (in plan file)                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ## Phase 1: Setup                                                    │   │
│  │ - [x] Create database schema                                         │   │
│  │ - [x] Add migrations                                                 │   │
│  │ - [ ] Write seed data      ◄── Modifies plan file                   │   │
│  │                                                                      │   │
│  │ Problems:                                                            │   │
│  │ • Plan file = spec + progress (mixed concerns)                      │   │
│  │ • Single session only (lost on /clear)                              │   │
│  │ • Git conflicts when multiple people work                           │   │
│  │ • Hard to parse programmatically                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  NEW: Task Tools (persistent, separate)                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Plan file stays clean (pure specification)                          │   │
│  │                                                                      │   │
│  │ TaskList:                                                            │   │
│  │   ✓ #1 Phase 1: Setup                                               │   │
│  │   ● #2 Phase 2: Core Logic (in_progress)                            │   │
│  │   ◻ #3 Phase 3: Integration › blocked by #2                         │   │
│  │                                                                      │   │
│  │ Benefits:                                                            │   │
│  │ • Plan = spec only (clean separation)                               │   │
│  │ • Persists across sessions                                          │   │
│  │ • Dependency tracking built-in                                      │   │
│  │ • Structured API for querying                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Session Support

```bash
# Session 1: Start work
CLAUDE_CODE_TASK_LIST_ID=plan-my-feature claude
> /implement-plan docs/plans/my-feature.md
# Complete Phase 1, 2...

# Session 2: Resume from different terminal
CLAUDE_CODE_TASK_LIST_ID=plan-my-feature claude
> /implement-plan docs/plans/my-feature.md
# Automatically knows Phase 1, 2 are done, starts Phase 3
```

---

## Continuous Learning System

### When Patterns Are Captured

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LEARNING CAPTURE POINTS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐                                                       │
│  │ Phase Completion │ ◄── End of implement-phase Step 8                    │
│  │                  │     Patterns from this phase captured                 │
│  └────────┬─────────┘                                                       │
│           │                                                                  │
│           ▼                                                                  │
│  ┌──────────────────┐                                                       │
│  │    /compact      │ ◄── PreCompact hook triggers                         │
│  │                  │     Patterns captured before context loss             │
│  └────────┬─────────┘                                                       │
│           │                                                                  │
│           ▼                                                                  │
│  ┌──────────────────┐                                                       │
│  │   Session End    │ ◄── Stop hook triggers                               │
│  │                  │     Final pattern extraction                          │
│  └────────┬─────────┘                                                       │
│           │                                                                  │
│           ▼                                                                  │
│  ~/.claude/skills/learned/                                                   │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⚠️  /clear does NOT trigger learning capture                              │
│      Patterns are captured at phase completion BEFORE you /clear            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Gets Learned

| Pattern Type | Example |
|--------------|---------|
| **Error Resolution** | "When you see 'ECONNREFUSED', check if the service is running" |
| **User Correction** | "User prefers functional style over class-based" |
| **Workaround** | "This framework doesn't support X, use Y instead" |
| **Project Pattern** | "All services in this codebase use dependency injection" |
| **Debugging Technique** | "Enable DEBUG=* to see detailed logs" |

### Future Session Usage

Learned patterns are loaded at session start and used for:
- Automatic matching when similar errors occur
- Pattern suggestions during debugging
- Consistency with project conventions

---

## Hooks and Automation

### Active Hooks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HOOK CONFIGURATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PreToolUse (before tool execution):                                         │
│  ├── tmux-dev-block: Block dev servers outside tmux                        │
│  ├── tmux-reminder: Suggest tmux for long-running commands                 │
│  ├── git-push-review: Reminder before git push                             │
│  ├── doc-file-warn: Warn about docs outside docs/ structure                │
│  └── strategic-compact: Suggest /compact at logical boundaries             │
│                                                                              │
│  PostToolUse (after tool execution):                                         │
│  ├── pr-url-logger: Log PR URL after creation                              │
│  ├── prettier-format: Auto-format JS/TS with Prettier                      │
│  ├── typescript-check: Run tsc after .ts/.tsx edits                        │
│  └── console-log-warn: Warn about console.log statements                   │
│                                                                              │
│  PreCompact:                                                                 │
│  ├── continuous-learning: Extract patterns before compaction               │
│  └── save-context-remind: Remind to save context                           │
│                                                                              │
│  SessionStart:                                                               │
│  └── load-context: Detect saved context files                              │
│                                                                              │
│  Stop (session end):                                                         │
│  ├── console-log-audit: Audit modified files for console.log               │
│  └── continuous-learning: Extract patterns before exit                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How Hooks Help Your Workflow

| Hook | How It Helps |
|------|--------------|
| strategic-compact | Suggests when to compact based on logical boundaries, not arbitrary thresholds |
| continuous-learning (PreCompact) | Captures patterns before context loss |
| continuous-learning (Stop) | Captures patterns when session ends |
| prettier-format | Keeps code formatted automatically |
| typescript-check | Catches type errors immediately |

---

## Skill Architecture (Claude Code 2.1.x)

### Skill Types and Context Behavior

Skills are categorized by their execution context and tool access:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SKILL CATEGORIES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ORCHESTRATORS (context: fork)                                              │
│  ├── Run in isolated subagent context                                       │
│  ├── Spawn their own subagents for work                                     │
│  ├── Never write code directly                                              │
│  └── Examples: implement-plan, implement-phase, create-plan                 │
│                                                                              │
│  INTERACTIVE SKILLS (no context: fork — main conversation only)             │
│  ├── Ask the user questions and wait for the answers                        │
│  ├── A fork has no conversation history and is backgrounded by default      │
│  └── Examples: brainstorm                                                   │
│                                                                              │
│  READ-ONLY SKILLS (allowed-tools: restricted)                               │
│  ├── Can only read, search, and run verification commands                   │
│  ├── Cannot modify files                                                    │
│  ├── Safe to run at any time                                                │
│  └── Examples: code-review, verification-loop, security-review,             │
│                 adversarial-reviewer (spawns persona subagents)             │
│                                                                              │
│  HYBRID SKILLS                                                              │
│  ├── Full tool access                                                       │
│  ├── Write files when appropriate                                           │
│  └── Examples: adr, e2e-testing, context-saver                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Frontmatter Fields

Skills are configured via YAML frontmatter in their SKILL.md files:

| Field | Purpose | Example |
|-------|---------|---------|
| `context: fork` | Run skill in isolated subagent — backgrounded by default (v2.1.218+), no conversation history. Never use on an interactive skill. | Orchestrator skills |
| `agent: Explore\|Plan` | Specify subagent type for forked context. Only meaningful with `context: fork`; `Explore` is read-only, so a skill that writes files can't use it. | Research/planning skills |
| `background: false` | Wait for a forked skill in the invoking turn instead of backgrounding it. Does not give the fork conversation history or the ability to ask the user anything — for that, drop `context: fork` entirely. | Forked skills that must finish first |
| `allowed-tools:` | Restrict which tools the skill can use | Read-only skills |
| `argument-hint:` | Autocomplete hint shown in CLI | `[plan-path]` |
| `user-invocable: false` | Hide from user menu (internal only) | implement-phase |
| `disable-model-invocation: true` | Prevent auto-invocation by Claude | prompt-generator |

### Frontmatter Examples

**Orchestrator skill** (spawns subagents):
```yaml
---
name: implement-plan
description: Orchestrate the execution of complete implementation plans...
context: fork
argument-hint: "[plan-path]"
---
```

**Read-only skill** (restricted tools):
```yaml
---
name: code-review
description: Systematic code review for implementation phases...
allowed-tools: Read, Grep, Glob, Bash
argument-hint: "[files-or-path?]"
---
```

**Internal skill** (not user-invocable):
```yaml
---
name: implement-phase
description: Execute a single phase from an implementation plan...
context: fork
user-invocable: false
argument-hint: "[plan-path] [phase-number]"
---
```

### Argument Substitution

Skills can receive arguments from the user. Arguments are substituted into the skill prompt:

| Variable | Description |
|----------|-------------|
| `$0` | First argument |
| `$1` | Second argument |
| `$ARGUMENTS` | All arguments as a single string |
| `${CLAUDE_SESSION_ID}` | Current session ID |

**Usage examples:**
```bash
/implement-plan docs/plans/my-feature.md    # $0 = "docs/plans/my-feature.md"
/e2e-testing run https://localhost:3000     # $0 = "run", $1 = "https://localhost:3000"
/adr Use JWT for authentication             # $0 = "Use JWT for authentication"
```

### Visualizing Skills

Use the skill-visualizer to generate an interactive HTML map:

```bash
/skill-visualizer skills
```

This creates a D3.js force-directed graph showing:
- All skills as color-coded nodes (by type)
- Dependency arrows between skills
- Hover tooltips with descriptions
- Auto-opens in browser

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SKILL VISUALIZATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│       ┌─────────────┐                                                       │
│       │ brainstorm  │─────────────────┐                                     │
│       └─────────────┘                 │                                     │
│              │                        ▼                                     │
│              │              ┌─────────────────┐                             │
│              └─────────────►│  create-plan    │                             │
│                             └────────┬────────┘                             │
│                                      │                                      │
│                                      ▼                                      │
│                             ┌─────────────────┐                             │
│                             │ implement-plan  │                             │
│                             └────────┬────────┘                             │
│                                      │                                      │
│              ┌───────────────────────┼───────────────────────┐             │
│              ▼                       ▼                       ▼             │
│     ┌────────────────┐    ┌─────────────────┐    ┌────────────────┐        │
│     │ implement-phase│───►│ verification-   │───►│  code-review   │        │
│     │                │    │      loop       │    │                │        │
│     └────────────────┘    └─────────────────┘    └────────────────┘        │
│                                                                              │
│  Legend:                                                                    │
│    ■ Orchestrator (purple)    ■ Read-only (green)    ■ Hybrid (blue)       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Skill Summary Table

| Skill | Type | Context | Agent | Key Tools |
|-------|------|---------|-------|-----------|
| brainstorm | Interactive | main conversation | - | All |
| deep-brainstorm | Interactive | main conversation | - | All |
| team-brainstorm | Interactive (orchestrator) | main conversation | - | All (+ TeamCreate, SendMessage) |
| tt-brainstorm | Interactive | main conversation | - | All |
| create-plan | Interactive (orchestrator) | main conversation | - | All |
| team-create-plan | Interactive (orchestrator) | main conversation | - | All |
| tt-create-plan | Interactive (orchestrator) | main conversation | - | All |
| user-story | Interactive | main conversation | - | All |
| implement-plan | Interactive (orchestrator) | main conversation | - | All |
| team-implement-plan | Interactive (orchestrator) | main conversation | - | All |
| team-implement-plan-full | Interactive (orchestrator) | main conversation | - | All |
| tt-implement-plan | Interactive (orchestrator) | main conversation | - | All |
| tt-workflow-audit | Interactive (orchestrator) | main conversation | - | All (+ Workflow) |
| tt-workflow-build | Interactive (orchestrator) | main conversation | - | All (+ Workflow) |
| tt-workflow-run | Interactive (orchestrator) | main conversation | - | All |
| workflow-guide | Interactive | main conversation | - | Read |
| agent-creator | Interactive | main conversation | - | All |
| implement-phase | Orchestrator | fork | - | All |
| tt-implement-phase | Orchestrator | fork | - | All |
| codebase-research | Orchestrator | fork | - | Read, Glob, Grep, Bash, Agent |
| code-review | Read-only | - | - | Read, Grep, Glob, Bash |
| adversarial-reviewer | Read-only (orchestrator) | - | - | Read, Grep, Glob, Bash, Agent |
| verification-loop | Read-only | - | - | Read, Glob, Bash |
| security-review | Read-only | - | - | Read, Glob, Grep, Bash |
| code-quality-audit | Read-only | - | - | Read, Glob, Grep, Bash, Write |
| strategic-compact | Read-only | - | - | Read, Bash |
| adr | Hybrid | - | - | All |
| e2e-testing | Hybrid | - | - | All |
| context-saver | Hybrid | - | - | All |
| prompt-generator | Hybrid | - | - | All |
| skill-visualizer | Hybrid | - | - | Bash, Read, Glob, Write |

---

## Summary: The Complete Flow

```
1. /brainstorm (optional)
   └── Clarify requirements, create ADRs

2. /create-plan
   └── Research codebase, design phases, create tasks

3. /implement-plan
   └── For each phase:
       ├── implement-phase (8 steps)
       ├── Quality gates (verification, review, ADR)
       ├── Learnings captured
       └── Wait for confirmation

4. /clear (your workflow)
   └── Fresh context, progress preserved in Task tools

5. Repeat step 3-4 until all phases complete

6. Session end
   └── Final learnings captured
```

**Your investment**: Plan once, execute phase by phase, never lose progress, always learn.
