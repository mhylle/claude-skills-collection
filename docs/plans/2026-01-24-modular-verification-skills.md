---
task_list_id: plan-2026-01-24-modular-verification-skills
---

# Implementation Plan: Modular Verification and Quality Skills

## Overview

Add six modular skills to enhance the Claude Code skill system: security-review, verification-loop, continuous-learning, strategic-compact, eval-harness, and TDD mode for implement-phase. Each skill is standalone and optionally integrated into the implement-phase pipeline.

## Context

The everything-claude-code repository contains valuable patterns for verification, security, learning, and evaluation that would enhance our skill system. Per ADR-0002, we implement these as modular, independently-invocable skills rather than a monolithic solution.

## Design Decision

Implement each enhancement as a standalone skill that can be:
- Invoked manually via `/skill-name`
- Integrated into implement-phase as optional steps
- Used independently by other skills

**ADR Reference**: [ADR-0002](../decisions/ADR-0002-modular-verification-skills.md)

## Related ADRs

- [ADR-0001](../decisions/ADR-0001-separate-plan-spec-from-progress-tracking.md): Task tools for progress tracking
- [ADR-0002](../decisions/ADR-0002-modular-verification-skills.md): Modular verification skills approach

## Implementation Phases

### Phase 1: Security Review Skill

**Objective**: Create a comprehensive security review skill with checklists for secrets, input validation, injection prevention, auth, XSS/CSRF, rate limiting, and dependency security.

**Verification Approach**: Skill file validates as markdown, contains all 10 security categories from reference, can be invoked manually.

**Tasks**:
- [ ] Create `skills/security-review/SKILL.md` with security checklist framework
- [ ] Create `skills/security-review/references/security-checklist.md` with detailed checks
- [ ] Add trigger conditions (auth code, user input, API endpoints, secrets)
- [ ] Document integration point for implement-phase

**Exit Conditions**:

Build Verification:
- [ ] `skills/security-review/SKILL.md` exists and is valid markdown
- [ ] `skills/security-review/references/security-checklist.md` exists

Runtime Verification:
- [ ] Skill can be read without errors
- [ ] References are properly linked

Functional Verification:
- [ ] Skill contains all 10 security categories (secrets, input validation, SQL injection, auth, XSS, CSRF, rate limiting, sensitive data, blockchain if applicable, dependencies)
- [ ] Output format defined for implement-phase integration

---

### Phase 2: Verification Loop Skill

**Objective**: Create a 6-phase comprehensive verification skill (build, type, lint, test, security scan, diff review) that extends beyond basic exit conditions.

**Verification Approach**: Skill executes all 6 verification phases and produces structured report.

**Tasks**:
- [ ] Create `skills/verification-loop/SKILL.md` with 6-phase verification framework
- [ ] Define output format compatible with implement-phase
- [ ] Add security scan phase (secrets detection, console.log warnings)
- [ ] Add diff review phase (unintended changes detection)
- [ ] Document project-type detection for appropriate commands

**Exit Conditions**:

Build Verification:
- [ ] `skills/verification-loop/SKILL.md` exists and is valid markdown

Runtime Verification:
- [ ] Skill can be read without errors

Functional Verification:
- [ ] All 6 phases defined: Build, Type, Lint, Test, Security, Diff
- [ ] Each phase has PASS/FAIL criteria
- [ ] Output format produces verification report
- [ ] Project-type detection documented (Node, Python, Go, Rust)

---

### Phase 3: Continuous Learning Skill

**Objective**: Create a Stop hook skill that extracts reusable patterns from sessions and saves them as learned skills.

**Verification Approach**: Skill defines pattern extraction logic and learned skills storage format.

**Tasks**:
- [ ] Create `skills/continuous-learning/SKILL.md` with pattern extraction framework
- [ ] Create `skills/continuous-learning/config.json` for configuration
- [ ] Define pattern types: error_resolution, user_corrections, workarounds, debugging_techniques, project_specific
- [ ] Define learned skills output format at `~/.claude/skills/learned/`
- [ ] Document Stop hook configuration

**Exit Conditions**:

Build Verification:
- [ ] `skills/continuous-learning/SKILL.md` exists
- [ ] `skills/continuous-learning/config.json` exists and is valid JSON

Runtime Verification:
- [ ] Config file parses without errors

Functional Verification:
- [ ] All 5 pattern types defined
- [ ] Learned skills output format specified
- [ ] Stop hook configuration documented
- [ ] Extraction threshold configurable

---

### Phase 4: Strategic Compact Skill

**Objective**: Create a PreToolUse hook skill that suggests manual `/compact` at logical boundaries rather than arbitrary auto-compaction.

**Verification Approach**: Skill defines threshold detection and suggestion logic.

**Tasks**:
- [ ] Create `skills/strategic-compact/SKILL.md` with compaction suggestion framework
- [ ] Define tool call tracking mechanism
- [ ] Define threshold configuration (default: 50 calls)
- [ ] Document best practices for when to compact
- [ ] Document PreToolUse hook configuration

**Exit Conditions**:

Build Verification:
- [ ] `skills/strategic-compact/SKILL.md` exists

Runtime Verification:
- [ ] Skill can be read without errors

Functional Verification:
- [ ] Threshold-based suggestion logic defined
- [ ] Tool call tracking documented
- [ ] PreToolUse hook configuration documented
- [ ] Best practices section included

---

### Phase 5: Eval Harness Skill

**Objective**: Create a formal evaluation framework with capability evals, regression evals, and pass@k metrics.

**Verification Approach**: Skill defines eval types, grader types, and metrics tracking.

**Tasks**:
- [ ] Create `skills/eval-harness/SKILL.md` with eval framework
- [ ] Define capability eval format (can do something new)
- [ ] Define regression eval format (didn't break existing)
- [ ] Define grader types: code-based, model-based, human
- [ ] Define pass@k and pass^k metrics
- [ ] Create eval workflow: Define → Implement → Evaluate → Report

**Exit Conditions**:

Build Verification:
- [ ] `skills/eval-harness/SKILL.md` exists

Runtime Verification:
- [ ] Skill can be read without errors

Functional Verification:
- [ ] Capability eval format defined
- [ ] Regression eval format defined
- [ ] All 3 grader types documented
- [ ] pass@k metrics explained
- [ ] Eval workflow documented

---

### Phase 6: TDD Mode for Implement-Phase

**Objective**: Enhance implement-phase with optional TDD mode that enforces test-first development pattern.

**Verification Approach**: implement-phase accepts TDD mode flag and enforces test-first workflow.

**Tasks**:
- [ ] Update `skills/implement-phase/SKILL.md` to support TDD mode
- [ ] Add TDD mode configuration option in plan metadata
- [ ] Document test-first workflow: RED → GREEN → REFACTOR
- [ ] Add coverage verification (80% minimum target)
- [ ] Update Step 1 (Implementation) to enforce tests-before-code when TDD enabled

**Exit Conditions**:

Build Verification:
- [ ] `skills/implement-phase/SKILL.md` updated successfully

Runtime Verification:
- [ ] Skill can be read without errors

Functional Verification:
- [ ] TDD mode configuration documented
- [ ] RED → GREEN → REFACTOR cycle explained
- [ ] Coverage requirements specified (80% target)
- [ ] Step 1 includes TDD enforcement logic

---

### Phase 7: Integration and Installation

**Objective**: Update implement-phase to support optional skill steps and update install.sh to include new skills.

**Verification Approach**: New skills install correctly and implement-phase can invoke them as optional steps.

**Tasks**:
- [ ] Update `skills/implement-phase/SKILL.md` to add optional steps for security-review and verification-loop
- [ ] Update `install.sh` to include new skills (should auto-detect from skills/ directory)
- [ ] Verify all new skills copy to `~/.claude/skills/` on install
- [ ] Test skill invocation pattern works

**Exit Conditions**:

Build Verification:
- [ ] All 5 new skill directories exist in `skills/`
- [ ] `install.sh` runs without errors

Runtime Verification:
- [ ] `./install.sh` completes successfully
- [ ] All skills appear in `~/.claude/skills/`

Functional Verification:
- [ ] implement-phase documents optional security-review step
- [ ] implement-phase documents optional verification-loop step
- [ ] Skills can be invoked manually via `/skill-name`

## Dependencies

- Existing implement-phase skill structure
- ADR-0002 decision (already created)
- Reference material from everything-claude-code repo (already analyzed)

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hook configuration complexity | Medium | Medium | Document hook setup clearly, provide examples |
| Skill invocation overhead | Low | Low | Skills are optional, users enable as needed |
| Continuous learning storage conflicts | Low | Medium | Use dedicated `learned/` subdirectory |
| TDD mode too strict | Medium | Low | Make TDD optional via plan metadata |

## Summary

| Phase | Skill | Type | Priority |
|-------|-------|------|----------|
| 1 | security-review | New skill | High |
| 2 | verification-loop | New skill | High |
| 3 | continuous-learning | New skill + hook | Medium |
| 4 | strategic-compact | New skill + hook | Medium |
| 5 | eval-harness | New skill | Medium |
| 6 | TDD mode | Enhancement | Medium |
| 7 | Integration | Updates | High |
