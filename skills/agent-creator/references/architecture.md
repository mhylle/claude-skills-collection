# Agent Architecture Reference

## Core Interfaces

### Tool Interface

Every agent exposes this interface - the uniform contract enabling composition:

```typescript
interface Tool {
  /** Unique identifier for this tool */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description for LLM tool selection */
  description: string;

  /** JSON Schema for input validation */
  inputSchema: JSONSchema;

  /** JSON Schema for output structure */
  outputSchema: JSONSchema;

  /** Execute the tool */
  execute(input: any, context?: ExecutionContext): Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  output: any;
  error?: string;
  metadata?: Record<string, any>;
}

interface ExecutionContext {
  id: string;
  parent_context_id?: string;  // For nested agent calls
  depth: number;
  started_at: Date;
  metadata: Record<string, any>;
}
```

### Plan Interface

DAG-based plans enable parallel execution of independent steps:

```typescript
interface Plan {
  id: string;
  goal: string;
  success_criteria: string[];
  steps: PlanStep[];
  version: number;
  created_at: Date;
}

interface PlanStep {
  id: string;
  description: string;
  tool_id: string;
  input: any;
  success_criteria: string[];
  evaluator_type: string;
  depends_on: string[];  // Step IDs that must complete first
  estimated_tokens?: number;
}
```

### Evaluation Interface

```typescript
interface EvaluationResult {
  passed: boolean;
  score: number;  // 0.0 - 1.0
  feedback: string;
  suggestions?: string[];
  metadata?: Record<string, any>;
}

interface Evaluator {
  type: string;
  evaluate(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext
  ): Promise<EvaluationResult>;
}
```

## Component Roles

### Orchestrator

The workflow controller that manages the agent's execution lifecycle.

**Responsibilities**:
- Route messages between components
- Manage planning loop (plan → evaluate → revise)
- Manage execution loop (execute → evaluate → retry)
- Enforce iteration limits
- Handle escalation and errors
- Track execution state

**Key Methods**:
```typescript
interface OrchestratorService {
  run(input: any, context?: ExecutionContext): Promise<ToolResult>;

  // Internal coordination
  requestPlan(goal: string, context: ExecutionContext): Promise<Plan>;
  executeStep(step: PlanStep, context: ExecutionContext): Promise<ToolResult>;
  evaluateResult(result: ToolResult, step: PlanStep): Promise<EvaluationResult>;
}
```

**Planning Loop**:
```
for attempt = 1 to maxPlanIterations:
  plan = planner.createPlan(goal, context)
  evaluation = evaluator.evaluate(plan, plan_criteria)
  if evaluation.passed:
    return plan
  goal = refineGoal(goal, evaluation.feedback)
throw PlanningFailedError
```

**Execution Loop** (per step):
```
for attempt = 1 to maxStepRetries:
  result = executor.execute(step)
  evaluation = evaluator.evaluate(result, step.success_criteria)
  if evaluation.passed:
    return result
  step.input = refineInput(step.input, evaluation.feedback)
return FailedResult(evaluation.feedback)
```

### Planner

Strategic decomposition of goals into executable plans.

**Responsibilities**:
- Decompose queries into DAG-based plans
- Select appropriate tools from registry
- Assign evaluator types per step
- Define step dependencies for parallel execution
- Estimate resource requirements

**Key Methods**:
```typescript
interface PlannerService {
  createPlan(goal: string, context: ExecutionContext): Promise<Plan>;
  revisePlan(plan: Plan, feedback: string): Promise<Plan>;
  validatePlan(plan: Plan): ValidationResult;
}
```

**DAG Construction Rules**:
1. Steps without dependencies (`depends_on: []`) can run in parallel
2. A step can only start after all dependencies complete successfully
3. No cycles allowed - validation must check for this
4. Failed dependencies should mark dependent steps as blocked

### Executor

Task execution through uniform tool interface.

**Responsibilities**:
- Execute individual plan steps
- Call tools through uniform interface
- Pass context for nested agents
- Return results for evaluation
- Handle tool errors gracefully

**Key Methods**:
```typescript
interface ExecutorService {
  executeStep(step: PlanStep, context: ExecutionContext): Promise<ToolResult>;
  executePlan(plan: Plan, context: ExecutionContext): Promise<PlanExecutionResult>;
}
```

**Parallel Execution Strategy**:
```typescript
async executePlan(plan: Plan, context: ExecutionContext) {
  const completed = new Map<string, ToolResult>();
  const pending = new Set(plan.steps.map(s => s.id));

  while (pending.size > 0) {
    // Find steps with all dependencies satisfied
    const ready = plan.steps.filter(step =>
      pending.has(step.id) &&
      step.depends_on.every(dep => completed.has(dep))
    );

    // Execute ready steps in parallel
    const results = await Promise.all(
      ready.map(step => this.executeStep(step, context))
    );

    // Update state
    ready.forEach((step, i) => {
      completed.set(step.id, results[i]);
      pending.delete(step.id);
    });
  }

  return { completed };
}
```

### Evaluator Registry

Quality assurance through pluggable evaluators.

**Responsibilities**:
- Maintain registry of evaluator strategies
- Route evaluation requests by type
- Aggregate evaluations when needed
- Provide actionable feedback

**Key Methods**:
```typescript
interface EvaluatorRegistry {
  register(evaluator: Evaluator): void;
  get(type: string): Evaluator;
  evaluate(
    type: string,
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext
  ): Promise<EvaluationResult>;
}
```

### State Service

Persistence and context management.

**Responsibilities**:
- Persist execution contexts
- Store agent messages
- Track plan versions
- Record step executions
- Enable debugging and replay

**Key Methods**:
```typescript
interface StateService {
  createContext(input: any, parentId?: string): Promise<ExecutionContext>;
  updateContext(id: string, updates: Partial<ExecutionContext>): Promise<void>;

  savePlan(plan: Plan, contextId: string): Promise<void>;
  saveStepExecution(execution: StepExecution): Promise<void>;

  addMessage(message: AgentMessage): Promise<void>;
  getMessages(contextId: string): Promise<AgentMessage[]>;
}
```

## Composition Pattern

### Nested Agent Calls

When Agent A uses Agent B as a tool:

```
Agent A receives input
  → A.Orchestrator creates context (depth=0)
  → A.Planner creates plan with step using "agent-b" tool
  → A.Executor calls B.execute(input, childContext)
    → B.Orchestrator creates context (depth=1, parent=A.context)
    → B does its work...
    → B returns ToolResult
  → A.Evaluator evaluates B's result
  → A continues with plan
```

**Context Propagation**:
```typescript
// In executor when calling another agent
const childContext: ExecutionContext = {
  id: uuid(),
  parent_context_id: context.id,
  depth: context.depth + 1,
  started_at: new Date(),
  metadata: { ...context.metadata, parent_step: step.id },
};

// Check depth limit
if (childContext.depth > config.maxDepth) {
  throw new MaxDepthExceededError();
}

const result = await tool.execute(step.input, childContext);
```

### Tool Registry Pattern

```typescript
@Injectable()
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor(
    // Inject other agents as tools
    private readonly researchTool: ResearchTool,
    private readonly webSearchTool: WebSearchTool,
  ) {
    this.register(this.researchTool);
    this.register(this.webSearchTool);
  }

  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  get(id: string): Tool {
    const tool = this.tools.get(id);
    if (!tool) throw new ToolNotFoundError(id);
    return tool;
  }

  list(): ToolDescription[] {
    return Array.from(this.tools.values()).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
    }));
  }
}
```

## Error Handling Patterns

### Graceful Degradation

```typescript
async executeStep(step: PlanStep, context: ExecutionContext): Promise<ToolResult> {
  try {
    const tool = this.toolRegistry.get(step.tool_id);
    return await tool.execute(step.input, context);
  } catch (error) {
    if (error instanceof ToolNotFoundError) {
      return {
        success: false,
        output: null,
        error: `Tool ${step.tool_id} not available`,
        metadata: { recoverable: false },
      };
    }
    if (error instanceof TimeoutError) {
      return {
        success: false,
        output: null,
        error: 'Execution timed out',
        metadata: { recoverable: true, suggestion: 'retry with smaller input' },
      };
    }
    throw error;
  }
}
```

### Evaluation-Driven Retry

```typescript
async executeWithRetry(
  step: PlanStep,
  context: ExecutionContext,
  maxRetries: number
): Promise<ToolResult> {
  let lastResult: ToolResult;
  let currentInput = step.input;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await this.executeStep({ ...step, input: currentInput }, context);

    const evaluation = await this.evaluatorRegistry.evaluate(
      step.evaluator_type,
      lastResult,
      step.success_criteria,
      context
    );

    if (evaluation.passed) {
      return lastResult;
    }

    // Refine input based on feedback
    currentInput = await this.refineInput(currentInput, evaluation.feedback, step);

    await this.stateService.addMessage({
      context_id: context.id,
      role: 'system',
      content: `Retry ${attempt}/${maxRetries}: ${evaluation.feedback}`,
    });
  }

  return {
    ...lastResult,
    metadata: {
      ...lastResult.metadata,
      max_retries_exceeded: true,
    },
  };
}
```
