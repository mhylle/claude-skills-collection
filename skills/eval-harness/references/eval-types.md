# Eval types

Two primary eval types: **capability** (new functionality works) and **regression** (existing functionality still works). This file covers the structure and example shape for each. Read it when defining a new eval.

---

## Capability evals

**Purpose:** Verify that a new capability works correctly. Capability evals test whether the system can do something it couldn't do before, or does something better than before.

**When to use:**
- Adding new features
- Improving existing functionality
- Testing edge cases
- Validating complex behaviors

### Structure

```yaml
capability_eval:
  id: string                    # Unique identifier
  name: string                  # Human-readable name
  description: string           # What this eval tests
  category: string              # Grouping for organization

  input:
    type: string                # "prompt", "file", "api_call", etc.
    content: any                # The actual input data
    context: object             # Additional context if needed

  expected_output:
    type: string                # "exact", "contains", "pattern", "semantic"
    value: any                  # Expected result or pattern
    alternatives: list          # Acceptable alternative outputs

  grader:
    type: string                # "code", "model", "human"
    config: object              # Grader-specific configuration

  metadata:
    difficulty: string          # "easy", "medium", "hard"
    tags: list                  # For filtering and organization
    timeout_seconds: number     # Maximum time allowed
    retries: number             # Number of retry attempts
    weight: number              # Importance weight for scoring
```

### Examples

```yaml
# Example 1: Code generation capability
- id: "cap-codegen-001"
  name: "Generate Python function from description"
  description: "Test ability to generate correct Python code from natural language"
  category: "code_generation"

  input:
    type: "prompt"
    content: "Write a Python function that calculates the factorial of a number recursively"
    context:
      language: "python"
      style: "functional"

  expected_output:
    type: "functional"
    value:
      test_cases:
        - input: [5]
          output: 120
        - input: [0]
          output: 1
        - input: [1]
          output: 1
        - input: [10]
          output: 3628800

  grader:
    type: "code"
    config:
      executor: "python"
      function_name: "factorial"
      timeout_per_case: 5

  metadata:
    difficulty: "easy"
    tags: ["python", "recursion", "math"]
    timeout_seconds: 30
    weight: 1.0

# Example 2: Semantic understanding capability
- id: "cap-semantic-001"
  name: "Extract key information from technical document"
  description: "Test ability to identify and extract relevant technical details"
  category: "information_extraction"

  input:
    type: "file"
    content: "path/to/technical-spec.md"
    context:
      extraction_targets: ["dependencies", "api_endpoints", "configuration"]

  expected_output:
    type: "semantic"
    value:
      must_include:
        - "PostgreSQL 14+"
        - "/api/v1/users"
        - "DATABASE_URL environment variable"
      must_not_include:
        - "deprecated"
        - "legacy"

  grader:
    type: "model"
    config:
      model: "claude-3-5-sonnet"
      rubric: |
        Score the extraction on these criteria:
        1. Completeness: Did it find all required items? (0-5)
        2. Accuracy: Are the extracted items correct? (0-5)
        3. Relevance: Did it avoid including irrelevant information? (0-5)

  metadata:
    difficulty: "medium"
    tags: ["extraction", "documentation", "comprehension"]
    timeout_seconds: 60
    weight: 1.5
```

---

## Regression evals

**Purpose:** Verify that existing functionality still works after changes. Regression evals protect against unintended breakage.

**When to use:**
- After any code change
- Before merging PRs
- After dependency updates
- During refactoring

### Structure

```yaml
regression_eval:
  id: string                    # Unique identifier
  name: string                  # Human-readable name
  description: string           # What behavior this protects
  baseline_version: string      # Version/commit where baseline was captured

  baseline:
    output: any                 # Known-good output
    captured_at: datetime       # When baseline was established
    environment: object         # Environment details at capture

  current:
    input: any                  # Input to reproduce
    execution: object           # How to run the current version

  comparison:
    type: string                # "exact", "semantic", "numeric", "structural"
    tolerance: object           # Acceptable deviation from baseline
    ignore_fields: list         # Fields to exclude from comparison

  metadata:
    criticality: string         # "critical", "high", "medium", "low"
    last_passed: datetime       # Last successful run
    failure_count: number       # Number of times this has failed
```

### Examples

```yaml
# Example 1: API response regression
- id: "reg-api-001"
  name: "User list endpoint response structure"
  description: "Ensure user list API maintains backward compatibility"
  baseline_version: "v2.3.1"

  baseline:
    output:
      status: 200
      body:
        users:
          - id: "{{any_uuid}}"
            name: "{{any_string}}"
            email: "{{any_email}}"
            created_at: "{{any_iso_datetime}}"
        pagination:
          page: 1
          per_page: 20
          total: "{{any_number}}"
    captured_at: "2024-01-15T10:30:00Z"
    environment:
      node_version: "18.x"
      database: "postgresql"

  current:
    input:
      method: "GET"
      endpoint: "/api/v1/users"
      headers:
        Authorization: "Bearer {{test_token}}"
    execution:
      type: "http"
      base_url: "{{api_base_url}}"

  comparison:
    type: "structural"
    tolerance:
      allow_additional_fields: true
      allow_field_reordering: true
    ignore_fields:
      - "users.*.id"
      - "users.*.created_at"
      - "pagination.total"

  metadata:
    criticality: "critical"
    last_passed: "2024-01-20T14:00:00Z"
    failure_count: 0

# Example 2: Output quality regression
- id: "reg-quality-001"
  name: "Code review comment quality"
  description: "Maintain quality standards for generated code review comments"
  baseline_version: "v1.0.0"

  baseline:
    output:
      quality_scores:
        specificity: 4.2
        actionability: 4.5
        correctness: 4.8
        tone: 4.6
      sample_comments:
        - "Consider using `const` instead of `let` since this value is never reassigned"
        - "This function exceeds 50 lines; consider extracting the validation logic"
    captured_at: "2024-01-10T09:00:00Z"
    environment:
      model: "claude-3-5-sonnet"
      prompt_version: "2.1"

  current:
    input:
      code_diff: "path/to/test-diff.patch"
      context: "React component refactoring"
    execution:
      type: "skill"
      skill_name: "code-review"
      parameters:
        depth: "thorough"

  comparison:
    type: "numeric"
    tolerance:
      quality_scores:
        min_delta: -0.3          # Allow up to 0.3 point decrease
        max_delta: null          # No upper limit on improvement

  metadata:
    criticality: "high"
    last_passed: "2024-01-19T16:30:00Z"
    failure_count: 1
```
