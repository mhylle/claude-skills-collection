# Evaluators Reference

## Evaluator Registry Pattern

```typescript
import { Injectable } from '@nestjs/common';
import { Evaluator, EvaluationResult, ToolResult, ExecutionContext } from '../interfaces';

@Injectable()
export class EvaluatorRegistry {
  private readonly evaluators = new Map<string, Evaluator>();

  constructor(
    planQuality: PlanQualityEvaluator,
    completeness: CompletenessEvaluator,
    sourceQuality: SourceQualityEvaluator,
    synthesisQuality: SynthesisQualityEvaluator,
    writingQuality: WritingQualityEvaluator,
    formatCompliance: FormatComplianceEvaluator,
    codeQuality: CodeQualityEvaluator,
  ) {
    this.register(planQuality);
    this.register(completeness);
    this.register(sourceQuality);
    this.register(synthesisQuality);
    this.register(writingQuality);
    this.register(formatCompliance);
    this.register(codeQuality);
  }

  register(evaluator: Evaluator): void {
    this.evaluators.set(evaluator.type, evaluator);
  }

  get(type: string): Evaluator {
    const evaluator = this.evaluators.get(type);
    if (!evaluator) {
      throw new Error(`Evaluator not found: ${type}`);
    }
    return evaluator;
  }

  async evaluate(
    type: string,
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Promise<EvaluationResult> {
    const evaluator = this.get(type);
    return evaluator.evaluate(result, criteria, context);
  }
}
```

## Built-in Evaluator Types

| Type | Purpose | When to Use |
|------|---------|-------------|
| `plan_quality` | Validate plan structure, feasibility, no cycles | After planner creates a plan |
| `completeness` | Check all required items present | When output must include specific elements |
| `source_quality` | Assess source credibility | When using external sources |
| `synthesis_quality` | Evaluate information synthesis | When combining multiple sources |
| `writing_quality` | Assess clarity, tone, structure | When producing text content |
| `format_compliance` | Validate output schema | When output must match a schema |
| `code_quality` | Check code correctness | When producing code |

## Evaluator Implementations

### Base Evaluator

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Evaluator, EvaluationResult, ToolResult, ExecutionContext } from '../interfaces';
import { LlmService } from '../../shared/llm.service';
import { renderPrompt } from '../prompts/utils';

@Injectable()
export abstract class BaseEvaluator implements Evaluator {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly type: string;
  protected abstract readonly prompt: string;

  constructor(
    protected readonly config: ConfigService,
    protected readonly llm: LlmService,
  ) {}

  async evaluate(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Promise<EvaluationResult> {
    const promptVariables = this.buildPromptVariables(result, criteria, context);
    const renderedPrompt = renderPrompt(this.prompt, promptVariables);

    const response = await this.llm.complete({
      model: this.config.get('agent.llm.model'),
      maxTokens: 2048,
      system: 'You are a quality evaluator. Respond only with JSON.',
      messages: [{ role: 'user', content: renderedPrompt }],
    });

    return this.parseResponse(response);
  }

  protected buildPromptVariables(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Record<string, any> {
    return {
      output: result.output,
      success_criteria: criteria,
      context: context.metadata,
    };
  }

  protected parseResponse(response: string): EvaluationResult {
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
    const json = jsonMatch ? jsonMatch[1] : response;

    try {
      const parsed = JSON.parse(json);
      return {
        passed: parsed.passed ?? false,
        score: parsed.score ?? 0,
        feedback: parsed.feedback ?? 'No feedback provided',
        suggestions: parsed.suggestions,
        metadata: parsed,
      };
    } catch {
      this.logger.warn('Failed to parse evaluation response');
      return {
        passed: false,
        score: 0,
        feedback: 'Failed to parse evaluation',
      };
    }
  }
}
```

### Plan Quality Evaluator

```typescript
import { Injectable } from '@nestjs/common';
import { BaseEvaluator } from './base.evaluator';
import { PLAN_QUALITY_PROMPT } from '../prompts/evaluators/plan-quality.prompt';
import { ToolResult, ExecutionContext } from '../interfaces';
import { ToolRegistry } from '../tools/tool.registry';

@Injectable()
export class PlanQualityEvaluator extends BaseEvaluator {
  readonly type = 'plan_quality';
  protected readonly prompt = PLAN_QUALITY_PROMPT;

  constructor(
    config: ConfigService,
    llm: LlmService,
    private readonly toolRegistry: ToolRegistry,
  ) {
    super(config, llm);
  }

  protected buildPromptVariables(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Record<string, any> {
    return {
      plan: result.output,
      success_criteria: criteria,
      available_tools: this.toolRegistry.list(),
    };
  }
}
```

### Completeness Evaluator

```typescript
import { Injectable } from '@nestjs/common';
import { BaseEvaluator } from './base.evaluator';
import { COMPLETENESS_PROMPT } from '../prompts/evaluators/completeness.prompt';

@Injectable()
export class CompletenessEvaluator extends BaseEvaluator {
  readonly type = 'completeness';
  protected readonly prompt = COMPLETENESS_PROMPT;
}
```

### Source Quality Evaluator

```typescript
import { Injectable } from '@nestjs/common';
import { BaseEvaluator } from './base.evaluator';
import { SOURCE_QUALITY_PROMPT } from '../prompts/evaluators/source-quality.prompt';
import { ToolResult, ExecutionContext } from '../interfaces';

@Injectable()
export class SourceQualityEvaluator extends BaseEvaluator {
  readonly type = 'source_quality';
  protected readonly prompt = SOURCE_QUALITY_PROMPT;

  protected buildPromptVariables(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Record<string, any> {
    return {
      sources: result.output?.sources ?? result.output,
      success_criteria: criteria,
      context: context.metadata,
    };
  }
}
```

### Synthesis Quality Evaluator

```typescript
import { Injectable } from '@nestjs/common';
import { BaseEvaluator } from './base.evaluator';
import { SYNTHESIS_QUALITY_PROMPT } from '../prompts/evaluators/synthesis-quality.prompt';
import { ToolResult, ExecutionContext } from '../interfaces';

@Injectable()
export class SynthesisQualityEvaluator extends BaseEvaluator {
  readonly type = 'synthesis_quality';
  protected readonly prompt = SYNTHESIS_QUALITY_PROMPT;

  protected buildPromptVariables(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Record<string, any> {
    return {
      synthesis: result.output?.synthesis ?? result.output,
      sources: result.metadata?.sources ?? [],
      success_criteria: criteria,
    };
  }
}
```

### Writing Quality Evaluator

```typescript
import { Injectable } from '@nestjs/common';
import { BaseEvaluator } from './base.evaluator';
import { WRITING_QUALITY_PROMPT } from '../prompts/evaluators/writing-quality.prompt';
import { ToolResult, ExecutionContext } from '../interfaces';

@Injectable()
export class WritingQualityEvaluator extends BaseEvaluator {
  readonly type = 'writing_quality';
  protected readonly prompt = WRITING_QUALITY_PROMPT;

  protected buildPromptVariables(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Record<string, any> {
    return {
      text: result.output,
      success_criteria: criteria,
      audience: context.metadata?.audience ?? 'general',
      purpose: context.metadata?.purpose ?? 'inform',
    };
  }
}
```

### Format Compliance Evaluator

```typescript
import { Injectable } from '@nestjs/common';
import { BaseEvaluator } from './base.evaluator';
import { FORMAT_COMPLIANCE_PROMPT } from '../prompts/evaluators/format-compliance.prompt';
import { ToolResult, ExecutionContext } from '../interfaces';

@Injectable()
export class FormatComplianceEvaluator extends BaseEvaluator {
  readonly type = 'format_compliance';
  protected readonly prompt = FORMAT_COMPLIANCE_PROMPT;

  protected buildPromptVariables(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Record<string, any> {
    return {
      output: result.output,
      schema: context.metadata?.outputSchema ?? {},
      success_criteria: criteria,
    };
  }

  // Can also do programmatic validation before LLM
  async evaluate(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Promise<EvaluationResult> {
    // Quick schema validation first
    const schema = context.metadata?.outputSchema;
    if (schema) {
      const quickCheck = this.validateSchema(result.output, schema);
      if (!quickCheck.valid) {
        return {
          passed: false,
          score: 0,
          feedback: `Schema validation failed: ${quickCheck.errors.join(', ')}`,
          suggestions: ['Fix schema violations before resubmitting'],
        };
      }
    }

    // Then LLM evaluation for deeper analysis
    return super.evaluate(result, criteria, context);
  }

  private validateSchema(output: any, schema: any): { valid: boolean; errors: string[] } {
    // Basic JSON Schema validation
    // In production, use ajv or similar
    const errors: string[] = [];

    if (schema.required) {
      for (const field of schema.required) {
        if (output?.[field] === undefined) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
```

### Code Quality Evaluator

```typescript
import { Injectable } from '@nestjs/common';
import { BaseEvaluator } from './base.evaluator';
import { CODE_QUALITY_PROMPT } from '../prompts/evaluators/code-quality.prompt';
import { ToolResult, ExecutionContext } from '../interfaces';

@Injectable()
export class CodeQualityEvaluator extends BaseEvaluator {
  readonly type = 'code_quality';
  protected readonly prompt = CODE_QUALITY_PROMPT;

  protected buildPromptVariables(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Record<string, any> {
    return {
      code: result.output?.code ?? result.output,
      language: context.metadata?.language ?? 'typescript',
      context: context.metadata?.codeContext ?? '',
      success_criteria: criteria,
    };
  }
}
```

## Creating Custom Evaluators

To add a domain-specific evaluator:

1. Create the evaluator class extending `BaseEvaluator`
2. Define the `type` and `prompt`
3. Override `buildPromptVariables` if needed
4. Register in the `EvaluatorRegistry`

```typescript
// evaluators/domain-specific.evaluator.ts
@Injectable()
export class DomainSpecificEvaluator extends BaseEvaluator {
  readonly type = 'domain_specific';
  protected readonly prompt = `Your custom evaluation prompt...`;

  protected buildPromptVariables(
    result: ToolResult,
    criteria: string[],
    context: ExecutionContext,
  ): Record<string, any> {
    return {
      // Custom variables for your domain
      domain_data: result.output,
      domain_criteria: criteria,
      domain_context: context.metadata?.domainContext,
    };
  }
}

// evaluator.registry.ts - add to constructor
constructor(
  // ... existing evaluators
  domainSpecific: DomainSpecificEvaluator,
) {
  // ... existing registrations
  this.register(domainSpecific);
}
```

## Evaluation Strategies

### Threshold-Based Pass/Fail

Simple pass if score >= threshold:

```typescript
async evaluate(...): Promise<EvaluationResult> {
  const baseResult = await super.evaluate(...);
  const threshold = this.config.get('evaluator.passThreshold') ?? 0.7;

  return {
    ...baseResult,
    passed: baseResult.score >= threshold,
  };
}
```

### Multi-Criteria Aggregation

When multiple criteria must all pass:

```typescript
async evaluate(
  result: ToolResult,
  criteria: string[],
  context: ExecutionContext,
): Promise<EvaluationResult> {
  const results = await Promise.all(
    criteria.map(c => this.evaluateSingleCriterion(result, c, context))
  );

  const allPassed = results.every(r => r.passed);
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  return {
    passed: allPassed,
    score: avgScore,
    feedback: results.map(r => r.feedback).join('\n'),
    metadata: { criteria_results: results },
  };
}
```

### Weighted Criteria

When some criteria are more important:

```typescript
interface WeightedCriterion {
  criterion: string;
  weight: number;
}

async evaluate(
  result: ToolResult,
  criteria: WeightedCriterion[],
  context: ExecutionContext,
): Promise<EvaluationResult> {
  const results = await Promise.all(
    criteria.map(c => this.evaluateSingleCriterion(result, c.criterion, context))
  );

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const weightedScore = criteria.reduce(
    (sum, c, i) => sum + (results[i].score * c.weight),
    0
  ) / totalWeight;

  return {
    passed: weightedScore >= 0.7,
    score: weightedScore,
    feedback: `Weighted score: ${weightedScore.toFixed(2)}`,
    metadata: { weighted_results: results.map((r, i) => ({ ...r, weight: criteria[i].weight })) },
  };
}
```
