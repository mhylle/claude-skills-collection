# Implementation Prompt Template: Phase {PHASE_NUMBER} - {PHASE_NAME}

## Overview

This prompt template is designed for implementing each phase of the trading platform. The **main Claude session acts as an orchestrator** and delegates all implementation work to subagents to preserve context and maintain clean separation of concerns.

---

## Prompt to Use

```
Implement Phase {PHASE_NUMBER}: {PHASE_NAME} of the trading platform according to the plan at:
{PHASE_DOC_PATH}

IMPORTANT ORCHESTRATION REQUIREMENTS:
1. This is an ORCHESTRATION SESSION - do NOT implement code directly in this session
2. Use the implement-plan skill for structured plan execution
3. Spawn SUBAGENTS for all implementation work using the /spawn or /task commands
4. Track progress using TodoWrite in THIS session
5. Coordinate subagents and validate their work from this orchestration layer

## Implementation Strategy

### Phase Overview
Read the phase document at {PHASE_DOC_PATH} to understand:
- Objectives and deliverables
- Task breakdown and dependencies
- Success criteria (automated and manual)

### Orchestration Workflow

1. **Initial Planning** (Orchestrator Session)
   - Read the phase plan: {PHASE_DOC_PATH}
   - Read the general plan: {GENERAL_PLAN_PATH}
   - Create a task list using TodoWrite with all major task groups
   - Identify dependencies between task groups

2. **Task Delegation** (Orchestrator → Subagents)
   For each task or task group:

   a. **Spawn Subagent** using one of these patterns:

      **Pattern 1: File Creation Tasks**
      ```
      /spawn Create {files} for {feature}

      Context: We're implementing Phase {PHASE_NUMBER} - {PHASE_NAME}
      Task: Create the following files according to the plan at {PHASE_DOC_PATH}:
      - {file_path_1}: {description}
      - {file_path_2}: {description}

      Requirements:
      - Follow project guidelines in {PROJECT_ROOT}/CLAUDE.md
      - Use TypeScript strict mode
      - Include proper error handling
      - Add JSDoc comments for interfaces and classes

      Verify: Run lint and type check after creation
      ```

      **Pattern 2: Testing Tasks**
      ```
      /spawn Test {feature} implementation

      Context: Verify Phase {PHASE_NUMBER} task {task_id} completion
      Task:
      1. Run automated tests: npm test
      2. Run lint: npm run lint
      3. Verify build: npm run build
      4. Check specific criteria: {criteria}

      Report back: Test results and any failures
      ```

      **Pattern 3: Docker/Infrastructure Tasks**
      ```
      /spawn Setup {infrastructure_component}

      Context: Phase {PHASE_NUMBER} infrastructure setup
      Task: Create and verify {component} setup
      - Create configuration files
      - Start services with docker-compose
      - Verify health checks
      - Test connectivity

      Success criteria: {specific_criteria}
      ```

      **Pattern 4: Integration Tasks**
      ```
      /spawn Integrate {component_a} with {component_b}

      Context: Phase {PHASE_NUMBER} integration work
      Task: Connect {component_a} to {component_b}
      - Update imports and dependencies
      - Create interface adapters if needed
      - Add configuration
      - Write integration tests

      Verify: {integration_test_criteria}
      ```

   b. **Track in Orchestrator**
      Update TodoWrite with:
      - Task status: pending → in_progress → completed
      - Subagent ID/reference
      - Any blockers or issues

3. **Progress Monitoring** (Orchestrator Session)
   - Keep TodoWrite updated as subagents complete work
   - Validate outputs from subagents
   - Spawn additional subagents if issues arise
   - Maintain overall phase progress

4. **Validation After Each Task Group** (Orchestrator → Subagent)
   After completing a logical group of tasks, spawn a validation subagent:

   ```
   /spawn Validate {task_group} completion

   Context: Phase {PHASE_NUMBER} - {PHASE_NAME} validation
   Completed tasks: {list_of_task_ids}

   Verification checklist:
   1. All files created and in correct locations
   2. npm run lint passes
   3. npm run build succeeds
   4. npm test passes
   5. Specific criteria: {criteria_from_plan}

   Report: Pass/fail status and any issues found
   ```

5. **Phase Completion** (Orchestrator Session)
   - Spawn final validation subagent for all success criteria
   - Document any deviations from plan
   - Update phase status
   - Prepare handoff notes for next phase

## Subagent Delegation Patterns

### Task Type → Delegation Strategy

| Task Type | Delegation Pattern | Concurrency |
|-----------|-------------------|-------------|
| File creation (independent) | Parallel subagents (one per file or small group) | High (5-7) |
| File creation (dependent) | Sequential subagents | Low (1-2) |
| Testing/Validation | Single subagent per test suite | Medium (3-5) |
| Docker/Infrastructure | Single subagent per service | Medium (3-4) |
| Integration | Single subagent per integration point | Low (2-3) |
| Documentation | Single subagent | Low (1) |

### Context Preservation

**DO** in Orchestrator Session:
- Read phase plans and maintain overview
- Create and update TodoWrite tasks
- Spawn subagents with clear context
- Track overall progress
- Make strategic decisions about task ordering
- Validate high-level success criteria

**DON'T** in Orchestrator Session:
- Write production code directly
- Make detailed code changes
- Run implementation commands (npm install, git add, etc.)
- Get lost in implementation details

**DO** in Subagent Sessions:
- Focus on specific implementation task
- Write code, tests, configs
- Run build/test/lint commands
- Report back to orchestrator
- Handle errors and edge cases

**DON'T** in Subagent Sessions:
- Deviate from assigned task scope
- Make architectural decisions without orchestrator guidance
- Update TodoWrite (orchestrator's job)

## Error Handling

### When Subagent Reports Failure

1. **Analyze** the failure in orchestrator session
2. **Decide** on resolution strategy:
   - Respawn subagent with clarified instructions?
   - Adjust requirements or approach?
   - Mark as blocked and continue with independent tasks?
3. **Update** TodoWrite with blocker status
4. **Document** the issue and resolution

### When to Rollback

If critical failures occur:
1. Spawn cleanup subagent to revert changes
2. Document what went wrong
3. Revise approach in orchestrator session
4. Restart task group with new strategy

### When to Ask for Help

If orchestrator encounters:
- Fundamental architectural questions
- Conflicting requirements
- External service failures (Docker, Ollama, etc.)
- Repeated subagent failures on same task

→ Stop and ask the user for guidance

## Success Criteria Validation

### Automated Checks (via Subagent)
Create a validation subagent that runs:
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] Any phase-specific automated checks from {PHASE_DOC_PATH}

### Manual Checks (Orchestrator Guides User)
List manual verification steps from the plan:
- [ ] {manual_check_1}
- [ ] {manual_check_2}
- [ ] etc.

Prompt user to verify these and report results.

## Handoff to Next Phase

Once Phase {PHASE_NUMBER} is complete:

1. **Document Completion**
   - All success criteria met
   - Any deviations or notes
   - Known issues or technical debt

2. **Prepare Context for Next Phase**
   - What was built and where
   - Configuration changes made
   - Dependencies added
   - Any gotchas or important notes

3. **Clean State**
   - All TodoWrite tasks completed
   - No lingering blockers
   - Code committed (if using git)
   - Services running and healthy
```

---

## Example Orchestration Flow

### Phase 1 Example (Abbreviated)

**Orchestrator Session:**

```
Read phase plan and create tasks
   → TodoWrite: 11 tasks from plan

Task 1.1: Docker Compose Setup
   → /spawn "Create docker-compose.yml with PostgreSQL, Redis, Ollama services..."
   → Update TodoWrite: 1.1 in_progress
   [Wait for subagent completion]
   → Update TodoWrite: 1.1 completed

Task 1.2: TypeScript Config
   → /spawn "Tighten backend/tsconfig.json..."
   → Update TodoWrite: 1.2 in_progress
   [Wait for subagent completion]
   → Update TodoWrite: 1.2 completed

Task 1.3: Install Dependencies
   → /spawn "Install backend dependencies: @nestjs/config, @nestjs/typeorm..."
   → Update TodoWrite: 1.3 in_progress
   [Wait for subagent completion]
   → Update TodoWrite: 1.3 completed

Validate Group 1 (Infrastructure)
   → /spawn "Validate tasks 1.1-1.3: docker-compose up, npm build, npm lint"
   [Wait for validation results]
   → All passed

Task 1.4-1.6: Config and Structure
   → /spawn "Create config files and module structure..."
   [Continue pattern]

Final Validation
   → /spawn "Run all success criteria checks from plan"
   [Wait for results]
   → All criteria met

Phase 1 Complete
   → Document completion
   → Prepare handoff notes
```

---

## Checklist Before Starting

- [ ] Read phase document: {PHASE_DOC_PATH}
- [ ] Read general plan: {GENERAL_PLAN_PATH}
- [ ] Read project guidelines: {PROJECT_ROOT}/CLAUDE.md
- [ ] Understand dependencies from previous phases
- [ ] Create initial TodoWrite task list
- [ ] Identify which tasks can run in parallel
- [ ] Plan subagent delegation strategy

## Checklist During Implementation

- [ ] Orchestrator maintains high-level overview
- [ ] All implementation work delegated to subagents
- [ ] TodoWrite kept up-to-date with progress
- [ ] Regular validation after task groups
- [ ] Context preserved by avoiding implementation details in orchestrator
- [ ] Errors handled systematically
- [ ] User consulted when needed

## Checklist After Implementation

- [ ] All automated success criteria passing
- [ ] Manual success criteria verified with user
- [ ] TodoWrite shows all tasks completed
- [ ] No critical blockers remaining
- [ ] Handoff notes prepared for next phase
- [ ] Code quality verified (lint, build, test)

---

## Notes for Orchestrator

### Token Efficiency
- Keep orchestrator session focused on coordination
- Subagents handle implementation details
- Use `--uc` flag if context grows large
- Delegate validation to subagents rather than running checks directly

### Parallel vs Sequential
- **Parallel**: Independent file creation, separate services, isolated features
- **Sequential**: Dependent configs, integration tasks, tasks requiring previous outputs

### Subagent Sizing
- **Small tasks**: Single file or config (quick subagent)
- **Medium tasks**: Feature implementation with tests (moderate subagent)
- **Large tasks**: Module with multiple files and integration (substantial subagent)
- **Don't over-spawn**: Group related small tasks together

### When to Split vs Combine
- **Split** if tasks are truly independent and can fail separately
- **Combine** if tasks are tightly coupled or very small
- **Balance** parallelism (speed) with coordination overhead

---

## Template Variables Reference

When using this template, replace these placeholders:

- `{PHASE_NUMBER}`: e.g., "1", "2", "3"
- `{PHASE_NAME}`: e.g., "Foundation", "Data Pipeline", "Agent System"
- `{PHASE_DOC_PATH}`: e.g., "/home/user/project/docs/plans/01-phase-foundation.md"
- `{GENERAL_PLAN_PATH}`: e.g., "/home/user/project/docs/plans/00-general-plan.md"
- `{PROJECT_ROOT}`: e.g., "/home/user/project"

Additional placeholders used in examples:
- `{files}`: List of files to create
- `{feature}`: Feature name being implemented
- `{file_path_N}`: Specific file path
- `{description}`: Task description
- `{task_id}`: Task identifier from plan
- `{criteria}`: Success criteria
- `{component}`: Component name
- `{task_group}`: Logical group of related tasks
- `{list_of_task_ids}`: Comma-separated task IDs
- `{manual_check_N}`: Manual verification step
