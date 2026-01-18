# NestJS Patterns Reference

## Module Structure

### Agent Module

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AgentNameTool } from './agent-name.tool';
import { OrchestratorService } from './services/orchestrator.service';
import { PlannerService } from './services/planner.service';
import { ExecutorService } from './services/executor.service';
import { StateService } from './services/state.service';
import { EvaluatorRegistry } from './evaluators/evaluator.registry';
import { PlanQualityEvaluator } from './evaluators/plan-quality.evaluator';
import { CompletenessEvaluator } from './evaluators/completeness.evaluator';
import { ToolRegistry } from './tools/tool.registry';
import { ExecutionContextEntity } from './entities/execution-context.entity';
import { AgentMessageEntity } from './entities/agent-message.entity';
import { PlanEntity } from './entities/plan.entity';
import { StepExecutionEntity } from './entities/step-execution.entity';
import agentConfig from './config/agent-name.config';

@Module({
  imports: [
    ConfigModule.forFeature(agentConfig),
    TypeOrmModule.forFeature([
      ExecutionContextEntity,
      AgentMessageEntity,
      PlanEntity,
      StepExecutionEntity,
    ]),
  ],
  providers: [
    // Core services
    OrchestratorService,
    PlannerService,
    ExecutorService,
    StateService,

    // Evaluators
    EvaluatorRegistry,
    PlanQualityEvaluator,
    CompletenessEvaluator,

    // Tools
    ToolRegistry,

    // Public interface
    AgentNameTool,
  ],
  exports: [AgentNameTool],
})
export class AgentNameModule {}
```

## Service Templates

### Tool Implementation

```typescript
import { Injectable } from '@nestjs/common';
import { Tool, ToolResult, ExecutionContext } from '../interfaces';
import { OrchestratorService } from './services/orchestrator.service';
import { AgentNameInputDto } from './dto/agent-name-input.dto';
import { AgentNameOutputDto } from './dto/agent-name-output.dto';

@Injectable()
export class AgentNameTool implements Tool {
  readonly id = 'agent-name-v1';
  readonly name = 'Agent Name';
  readonly description = 'Description for LLM tool selection';

  readonly inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The query to process' },
      options: {
        type: 'object',
        properties: {
          depth: { type: 'number', default: 1 },
        },
      },
    },
    required: ['query'],
  };

  readonly outputSchema = {
    type: 'object',
    properties: {
      result: { type: 'string' },
      sources: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
    },
  };

  constructor(private readonly orchestrator: OrchestratorService) {}

  async execute(input: AgentNameInputDto, context?: ExecutionContext): Promise<ToolResult> {
    return this.orchestrator.run(input, context);
  }
}
```

### Orchestrator Service

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Tool, ToolResult, ExecutionContext, Plan, PlanStep, EvaluationResult } from '../interfaces';
import { PlannerService } from './planner.service';
import { ExecutorService } from './executor.service';
import { StateService } from './state.service';
import { EvaluatorRegistry } from '../evaluators/evaluator.registry';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly planner: PlannerService,
    private readonly executor: ExecutorService,
    private readonly state: StateService,
    private readonly evaluators: EvaluatorRegistry,
  ) {}

  async run(input: any, parentContext?: ExecutionContext): Promise<ToolResult> {
    const context = await this.state.createContext(input, parentContext?.id);

    try {
      // Check depth limit
      if (context.depth > this.config.get('agent.maxDepth')) {
        return {
          success: false,
          output: null,
          error: 'Maximum agent nesting depth exceeded',
        };
      }

      // Planning loop
      const plan = await this.planWithRetry(input, context);
      if (!plan) {
        return {
          success: false,
          output: null,
          error: 'Failed to create valid plan after max iterations',
        };
      }

      // Execution loop
      const result = await this.executePlan(plan, context);

      await this.state.updateContext(context.id, {
        completed_at: new Date(),
        status: result.success ? 'completed' : 'failed',
      });

      return result;
    } catch (error) {
      this.logger.error(`Orchestration failed: ${error.message}`, error.stack);
      await this.state.updateContext(context.id, {
        status: 'error',
        error: error.message,
      });
      throw error;
    }
  }

  private async planWithRetry(input: any, context: ExecutionContext): Promise<Plan | null> {
    const maxIterations = this.config.get('agent.maxPlanIterations');
    let goal = this.buildGoal(input);

    for (let i = 0; i < maxIterations; i++) {
      const plan = await this.planner.createPlan(goal, context);
      await this.state.savePlan(plan, context.id);

      const evaluation = await this.evaluators.evaluate(
        'plan_quality',
        { success: true, output: plan },
        plan.success_criteria,
        context,
      );

      if (evaluation.passed) {
        return plan;
      }

      this.logger.debug(`Plan iteration ${i + 1} failed: ${evaluation.feedback}`);
      goal = this.refineGoal(goal, evaluation.feedback);
    }

    return null;
  }

  private async executePlan(plan: Plan, context: ExecutionContext): Promise<ToolResult> {
    const results = await this.executor.executePlan(plan, context);

    // Aggregate results
    const allSucceeded = Array.from(results.values()).every(r => r.success);
    const finalStep = plan.steps[plan.steps.length - 1];
    const finalResult = results.get(finalStep.id);

    return {
      success: allSucceeded,
      output: finalResult?.output,
      metadata: {
        plan_id: plan.id,
        step_results: Object.fromEntries(results),
      },
    };
  }

  private buildGoal(input: any): string {
    // Convert input to goal string for planner
    return typeof input === 'string' ? input : JSON.stringify(input);
  }

  private refineGoal(goal: string, feedback: string): string {
    return `${goal}\n\nPrevious attempt feedback: ${feedback}`;
  }
}
```

### Planner Service

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan, PlanStep, ExecutionContext } from '../interfaces';
import { ToolRegistry } from '../tools/tool.registry';
import { LlmService } from '../../shared/llm.service';
import { PLANNER_PROMPT } from '../prompts/planner.prompt';
import { v4 as uuid } from 'uuid';

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmService,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async createPlan(goal: string, context: ExecutionContext): Promise<Plan> {
    const availableTools = this.toolRegistry.list();

    const response = await this.llm.complete({
      model: this.config.get('agent.llm.model'),
      maxTokens: this.config.get('agent.llm.maxTokens'),
      system: PLANNER_PROMPT,
      messages: [
        {
          role: 'user',
          content: this.buildPlannerInput(goal, availableTools),
        },
      ],
    });

    const planData = this.parsePlanResponse(response);

    return {
      id: uuid(),
      goal,
      success_criteria: planData.success_criteria,
      steps: planData.steps.map(s => ({
        ...s,
        id: uuid(),
      })),
      version: 1,
      created_at: new Date(),
    };
  }

  async revisePlan(plan: Plan, feedback: string): Promise<Plan> {
    const response = await this.llm.complete({
      model: this.config.get('agent.llm.model'),
      maxTokens: this.config.get('agent.llm.maxTokens'),
      system: PLANNER_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Revise this plan based on feedback:\n\nPlan: ${JSON.stringify(plan)}\n\nFeedback: ${feedback}`,
        },
      ],
    });

    const planData = this.parsePlanResponse(response);

    return {
      ...plan,
      steps: planData.steps.map(s => ({ ...s, id: uuid() })),
      version: plan.version + 1,
    };
  }

  validatePlan(plan: Plan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for cycles
    if (this.hasCycle(plan.steps)) {
      errors.push('Plan contains circular dependencies');
    }

    // Check all tools exist
    for (const step of plan.steps) {
      if (!this.toolRegistry.has(step.tool_id)) {
        errors.push(`Unknown tool: ${step.tool_id}`);
      }
    }

    // Check dependencies reference valid steps
    const stepIds = new Set(plan.steps.map(s => s.id));
    for (const step of plan.steps) {
      for (const dep of step.depends_on) {
        if (!stepIds.has(dep)) {
          errors.push(`Step ${step.id} depends on unknown step ${dep}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private hasCycle(steps: PlanStep[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const stepMap = new Map(steps.map(s => [s.id, s]));

    const dfs = (stepId: string): boolean => {
      visited.add(stepId);
      recursionStack.add(stepId);

      const step = stepMap.get(stepId);
      if (step) {
        for (const dep of step.depends_on) {
          if (!visited.has(dep) && dfs(dep)) return true;
          if (recursionStack.has(dep)) return true;
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id) && dfs(step.id)) {
        return true;
      }
    }
    return false;
  }

  private buildPlannerInput(goal: string, tools: any[]): string {
    return `Goal: ${goal}\n\nAvailable Tools:\n${JSON.stringify(tools, null, 2)}`;
  }

  private parsePlanResponse(response: string): any {
    // Extract JSON from response
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return JSON.parse(response);
  }
}
```

### Executor Service

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan, PlanStep, ToolResult, ExecutionContext } from '../interfaces';
import { ToolRegistry } from '../tools/tool.registry';
import { StateService } from './state.service';
import { EvaluatorRegistry } from '../evaluators/evaluator.registry';
import { v4 as uuid } from 'uuid';

@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly toolRegistry: ToolRegistry,
    private readonly state: StateService,
    private readonly evaluators: EvaluatorRegistry,
  ) {}

  async executePlan(
    plan: Plan,
    context: ExecutionContext,
  ): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();
    const pending = new Set(plan.steps.map(s => s.id));
    const stepMap = new Map(plan.steps.map(s => [s.id, s]));

    while (pending.size > 0) {
      // Find steps ready to execute (all dependencies satisfied)
      const ready = plan.steps.filter(step =>
        pending.has(step.id) &&
        step.depends_on.every(dep => results.has(dep) && results.get(dep)!.success)
      );

      if (ready.length === 0 && pending.size > 0) {
        // Blocked - some dependencies failed
        const blocked = Array.from(pending);
        this.logger.warn(`Blocked steps: ${blocked.join(', ')}`);
        break;
      }

      // Execute ready steps in parallel
      const executions = await Promise.all(
        ready.map(step => this.executeStepWithRetry(step, context, results))
      );

      // Record results
      ready.forEach((step, i) => {
        results.set(step.id, executions[i]);
        pending.delete(step.id);
      });
    }

    return results;
  }

  private async executeStepWithRetry(
    step: PlanStep,
    context: ExecutionContext,
    priorResults: Map<string, ToolResult>,
  ): Promise<ToolResult> {
    const maxRetries = this.config.get('agent.maxStepRetries');
    let currentInput = this.resolveInput(step.input, priorResults);
    let lastResult: ToolResult;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const execution = {
        id: uuid(),
        step_id: step.id,
        context_id: context.id,
        attempt,
        input: currentInput,
        started_at: new Date(),
      };

      lastResult = await this.executeStep(step.tool_id, currentInput, context);

      await this.state.saveStepExecution({
        ...execution,
        output: lastResult.output,
        success: lastResult.success,
        completed_at: new Date(),
      });

      if (!lastResult.success) {
        this.logger.debug(`Step ${step.id} failed: ${lastResult.error}`);
        continue;
      }

      // Evaluate result
      const evaluation = await this.evaluators.evaluate(
        step.evaluator_type,
        lastResult,
        step.success_criteria,
        context,
      );

      if (evaluation.passed) {
        return lastResult;
      }

      this.logger.debug(`Step ${step.id} evaluation failed: ${evaluation.feedback}`);
      currentInput = await this.refineInput(currentInput, evaluation.feedback);
    }

    return {
      ...lastResult!,
      metadata: { ...lastResult!.metadata, max_retries_exceeded: true },
    };
  }

  private async executeStep(
    toolId: string,
    input: any,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    try {
      const tool = this.toolRegistry.get(toolId);

      // Create child context for nested agents
      const childContext: ExecutionContext = {
        id: uuid(),
        parent_context_id: context.id,
        depth: context.depth + 1,
        started_at: new Date(),
        metadata: context.metadata,
      };

      return await tool.execute(input, childContext);
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private resolveInput(input: any, priorResults: Map<string, ToolResult>): any {
    // Replace references like {{step_id.output.field}} with actual values
    if (typeof input === 'string') {
      return input.replace(/\{\{(\w+)\.output\.(\w+)\}\}/g, (_, stepId, field) => {
        const result = priorResults.get(stepId);
        return result?.output?.[field] ?? '';
      });
    }
    if (typeof input === 'object') {
      return JSON.parse(
        JSON.stringify(input).replace(/\{\{(\w+)\.output\.(\w+)\}\}/g, (_, stepId, field) => {
          const result = priorResults.get(stepId);
          return result?.output?.[field] ?? '';
        })
      );
    }
    return input;
  }

  private async refineInput(input: any, feedback: string): Promise<any> {
    // Simple refinement - append feedback context
    if (typeof input === 'object') {
      return { ...input, _refinement_context: feedback };
    }
    return input;
  }
}
```

### State Service

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutionContext, Plan, AgentMessage, StepExecution } from '../interfaces';
import { ExecutionContextEntity } from '../entities/execution-context.entity';
import { AgentMessageEntity } from '../entities/agent-message.entity';
import { PlanEntity } from '../entities/plan.entity';
import { StepExecutionEntity } from '../entities/step-execution.entity';
import { v4 as uuid } from 'uuid';

@Injectable()
export class StateService {
  constructor(
    @InjectRepository(ExecutionContextEntity)
    private readonly contextRepo: Repository<ExecutionContextEntity>,
    @InjectRepository(AgentMessageEntity)
    private readonly messageRepo: Repository<AgentMessageEntity>,
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    @InjectRepository(StepExecutionEntity)
    private readonly executionRepo: Repository<StepExecutionEntity>,
  ) {}

  async createContext(input: any, parentId?: string): Promise<ExecutionContext> {
    const parent = parentId
      ? await this.contextRepo.findOne({ where: { id: parentId } })
      : null;

    const context = this.contextRepo.create({
      id: uuid(),
      parent_context_id: parentId,
      depth: parent ? parent.depth + 1 : 0,
      input,
      started_at: new Date(),
      status: 'running',
      metadata: {},
    });

    await this.contextRepo.save(context);
    return context;
  }

  async updateContext(id: string, updates: Partial<ExecutionContext>): Promise<void> {
    await this.contextRepo.update(id, updates);
  }

  async savePlan(plan: Plan, contextId: string): Promise<void> {
    await this.planRepo.save({
      ...plan,
      context_id: contextId,
      steps: JSON.stringify(plan.steps),
    });
  }

  async saveStepExecution(execution: StepExecution): Promise<void> {
    await this.executionRepo.save(execution);
  }

  async addMessage(message: Omit<AgentMessage, 'id' | 'created_at'>): Promise<void> {
    await this.messageRepo.save({
      id: uuid(),
      ...message,
      created_at: new Date(),
    });
  }

  async getMessages(contextId: string): Promise<AgentMessage[]> {
    return this.messageRepo.find({
      where: { context_id: contextId },
      order: { created_at: 'ASC' },
    });
  }

  async getContext(id: string): Promise<ExecutionContext | null> {
    return this.contextRepo.findOne({ where: { id } });
  }
}
```

## Entity Templates

### Execution Context Entity

```typescript
import { Entity, Column, PrimaryColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';

@Entity('agent_execution_contexts')
export class ExecutionContextEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  parent_context_id: string | null;

  @ManyToOne(() => ExecutionContextEntity, { nullable: true })
  @JoinColumn({ name: 'parent_context_id' })
  parent: ExecutionContextEntity;

  @Column({ type: 'int', default: 0 })
  depth: number;

  @Column({ type: 'jsonb' })
  input: any;

  @Column({ type: 'jsonb', nullable: true })
  output: any;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: 'pending' | 'running' | 'completed' | 'failed' | 'error';

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn()
  started_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;
}
```

### Plan Entity

```typescript
import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('agent_plans')
export class PlanEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  context_id: string;

  @Column('text')
  goal: string;

  @Column({ type: 'jsonb' })
  success_criteria: string[];

  @Column({ type: 'jsonb' })
  steps: string; // JSON stringified PlanStep[]

  @Column({ type: 'int', default: 1 })
  version: number;

  @CreateDateColumn()
  created_at: Date;
}
```

### Step Execution Entity

```typescript
import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('agent_step_executions')
export class StepExecutionEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  step_id: string;

  @Column('uuid')
  context_id: string;

  @Column({ type: 'int' })
  attempt: number;

  @Column({ type: 'jsonb' })
  input: any;

  @Column({ type: 'jsonb', nullable: true })
  output: any;

  @Column({ type: 'boolean', default: false })
  success: boolean;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  started_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;
}
```

### Agent Message Entity

```typescript
import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('agent_messages')
export class AgentMessageEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  context_id: string;

  @Column({ type: 'varchar', length: 50 })
  role: 'system' | 'planner' | 'executor' | 'evaluator' | 'orchestrator';

  @Column('text')
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  created_at: Date;
}
```

## DTO Templates

### Input DTO

```typescript
import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AgentOptionsDto {
  @IsOptional()
  @IsNumber()
  depth?: number;

  @IsOptional()
  @IsNumber()
  maxSteps?: number;
}

export class AgentNameInputDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AgentOptionsDto)
  options?: AgentOptionsDto;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}
```

### Output DTO

```typescript
export class AgentNameOutputDto {
  result: any;

  sources?: string[];

  confidence?: number;

  metadata?: {
    plan_id: string;
    steps_executed: number;
    total_tokens: number;
  };
}
```

## Config Pattern

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('agent', () => ({
  maxDepth: parseInt(process.env.AGENT_MAX_DEPTH, 10) || 3,
  maxPlanIterations: parseInt(process.env.AGENT_MAX_PLAN_ITERATIONS, 10) || 3,
  maxStepRetries: parseInt(process.env.AGENT_MAX_STEP_RETRIES, 10) || 3,
  timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS, 10) || 300000,
  llm: {
    model: process.env.AGENT_LLM_MODEL || 'claude-sonnet-4-20250514',
    maxTokens: parseInt(process.env.AGENT_LLM_MAX_TOKENS, 10) || 4096,
  },
}));
```

## Tool Registry Template

```typescript
import { Injectable } from '@nestjs/common';
import { Tool } from '../interfaces';

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(
    // Inject tools here - both simple tools and other agents
    // private readonly webSearchTool: WebSearchTool,
    // private readonly researchAgent: ResearchAgentTool,
  ) {
    // Register all tools
    // this.register(this.webSearchTool);
    // this.register(this.researchAgent);
  }

  register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.tools.set(tool.id, tool);
  }

  get(id: string): Tool {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new Error(`Tool not found: ${id}`);
    }
    return tool;
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  list(): Array<{
    id: string;
    name: string;
    description: string;
    inputSchema: any;
    outputSchema: any;
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    }));
  }
}
```
