# Graders

Three grader types: **code-based** (fast, deterministic), **model-based** (LLM judge for nuance), **human** (expert judgment for safety-critical / subjective). Read this when choosing or configuring a grader.

---

## Code-based graders

Use programmatic logic. Fast, consistent, deterministic.

### Exact match

Compares output exactly against an expected value.

```yaml
grader:
  type: "code"
  config:
    method: "exact_match"
    case_sensitive: true
    trim_whitespace: true
    normalize_newlines: true
```

**When to use:**
- Deterministic outputs (hashes, IDs, specific values)
- Formatted data with strict requirements
- API response codes and status

**Implementation sketch:**

```python
def exact_match_grader(output, expected, config):
    actual = output
    target = expected

    if config.get("trim_whitespace", True):
        actual = actual.strip()
        target = target.strip()

    if config.get("normalize_newlines", True):
        actual = actual.replace("\r\n", "\n")
        target = target.replace("\r\n", "\n")

    if not config.get("case_sensitive", True):
        actual = actual.lower()
        target = target.lower()

    return {
        "passed": actual == target,
        "score": 1.0 if actual == target else 0.0,
        "details": {
            "expected": target,
            "actual": actual
        }
    }
```

### Regex match

Validates output against regular expression patterns.

```yaml
grader:
  type: "code"
  config:
    method: "regex"
    pattern: "^function\\s+\\w+\\s*\\([^)]*\\)\\s*\\{"
    flags: ["multiline", "ignorecase"]
    must_match: true
    capture_groups: ["function_name"]
```

**When to use:**
- Validating format/structure without exact content
- Extracting specific patterns from output
- Flexible matching with variations allowed

**Implementation sketch:**

```python
import re

def regex_grader(output, config):
    pattern = config["pattern"]
    flags = 0

    if "multiline" in config.get("flags", []):
        flags |= re.MULTILINE
    if "ignorecase" in config.get("flags", []):
        flags |= re.IGNORECASE
    if "dotall" in config.get("flags", []):
        flags |= re.DOTALL

    match = re.search(pattern, output, flags)

    result = {
        "passed": (match is not None) == config.get("must_match", True),
        "score": 1.0 if match else 0.0,
        "details": {
            "pattern": pattern,
            "matched": match is not None
        }
    }

    if match and config.get("capture_groups"):
        result["details"]["captures"] = {
            name: match.group(name) if name in match.groupdict() else match.group(i+1)
            for i, name in enumerate(config["capture_groups"])
        }

    return result
```

### Function output

Executes generated code and validates results.

```yaml
grader:
  type: "code"
  config:
    method: "function_output"
    executor: "python"
    function_name: "solve"
    test_cases:
      - args: [1, 2]
        kwargs: {}
        expected: 3
        comparator: "equals"
      - args: [[1, 2, 3]]
        expected: 6
        comparator: "equals"
    timeout_per_case: 5
    sandbox: true
```

**When to use:**
- Code generation tasks
- Algorithm implementation verification
- Function correctness testing

**Implementation sketch:**

```python
import subprocess
import json
import tempfile
from typing import List, Dict, Any

def function_output_grader(code: str, config: Dict[str, Any]) -> Dict[str, Any]:
    results = []
    passed_count = 0

    for i, test_case in enumerate(config["test_cases"]):
        test_code = f'''
import json
import sys

{code}

result = {config["function_name"]}(*{json.dumps(test_case["args"])}, **{json.dumps(test_case.get("kwargs", {}))})
print(json.dumps({{"result": result}}))
'''

        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(test_code)
            temp_path = f.name

        try:
            result = subprocess.run(
                ["python", temp_path],
                capture_output=True,
                text=True,
                timeout=config.get("timeout_per_case", 5)
            )

            if result.returncode == 0:
                output = json.loads(result.stdout)["result"]
                expected = test_case["expected"]

                if compare(output, expected, test_case.get("comparator", "equals")):
                    passed_count += 1
                    results.append({"case": i, "passed": True, "output": output})
                else:
                    results.append({
                        "case": i,
                        "passed": False,
                        "output": output,
                        "expected": expected
                    })
            else:
                results.append({
                    "case": i,
                    "passed": False,
                    "error": result.stderr
                })

        except subprocess.TimeoutExpired:
            results.append({"case": i, "passed": False, "error": "timeout"})
        except Exception as e:
            results.append({"case": i, "passed": False, "error": str(e)})

    return {
        "passed": passed_count == len(config["test_cases"]),
        "score": passed_count / len(config["test_cases"]),
        "details": {
            "test_results": results,
            "passed_count": passed_count,
            "total_count": len(config["test_cases"])
        }
    }
```

---

## Model-based graders

Use LLMs to evaluate output quality. Best for nuanced judgments that are hard to codify.

### Configuration

```yaml
grader:
  type: "model"
  config:
    model: "claude-3-5-sonnet"           # Model to use for grading
    temperature: 0.0                      # Low temperature for consistency
    max_tokens: 1000
    rubric: string                        # Evaluation criteria
    scoring:
      type: "numeric"                     # "numeric", "categorical", "boolean"
      range: [1, 5]
      categories: []                      # For categorical scoring
    examples: []                          # Few-shot examples for calibration
```

**When to use:**
- Evaluating writing quality, tone, clarity
- Judging relevance or appropriateness
- Complex semantic matching
- When multiple valid outputs exist

### Prompt template

```yaml
model_grader_prompt: |
  You are an expert evaluator. Your task is to grade the following output according to the rubric provided.

  ## Input Given to System
  {input}

  ## System Output
  {output}

  ## Expected Output (Reference)
  {expected}

  ## Evaluation Rubric
  {rubric}

  ## Instructions
  1. Carefully compare the system output against the expected output
  2. Apply each criterion from the rubric
  3. Provide specific justification for each score
  4. Be consistent and objective

  ## Response Format
  Respond in JSON format:
  ```json
  {
    "scores": {
      "criterion_1": <score>,
      "criterion_2": <score>,
      ...
    },
    "overall_score": <weighted_average>,
    "passed": <true/false>,
    "justification": "<brief explanation>",
    "specific_feedback": [
      "<point 1>",
      "<point 2>"
    ]
  }
  ```
```

### Example rubrics

```yaml
# Code quality rubric
code_quality_rubric: |
  Evaluate the generated code on these criteria (1-5 scale):

  1. **Correctness** (weight: 0.4)
     - 5: Fully correct, handles all cases
     - 4: Mostly correct, minor issues
     - 3: Works for basic cases, fails edge cases
     - 2: Partially works, significant bugs
     - 1: Does not work

  2. **Readability** (weight: 0.2)
     - 5: Excellent naming, clear structure, good comments
     - 4: Good readability, minor improvements possible
     - 3: Acceptable, some unclear parts
     - 2: Hard to follow, poor naming
     - 1: Incomprehensible

  3. **Efficiency** (weight: 0.2)
     - 5: Optimal time and space complexity
     - 4: Good efficiency, minor improvements possible
     - 3: Acceptable for typical inputs
     - 2: Inefficient, may timeout on large inputs
     - 1: Extremely inefficient

  4. **Best Practices** (weight: 0.2)
     - 5: Follows all conventions, excellent patterns
     - 4: Follows most practices
     - 3: Some practices followed
     - 2: Few practices followed
     - 1: Ignores conventions

# Documentation quality rubric
documentation_rubric: |
  Evaluate the generated documentation on these criteria (1-5 scale):

  1. **Completeness** (weight: 0.3)
     - Does it cover all necessary topics?
     - Are there gaps in the explanation?

  2. **Accuracy** (weight: 0.3)
     - Is the information technically correct?
     - Are examples accurate and working?

  3. **Clarity** (weight: 0.25)
     - Is the writing clear and understandable?
     - Is jargon explained when used?

  4. **Organization** (weight: 0.15)
     - Is information logically structured?
     - Are sections appropriately sized?
```

### Calibration with examples

```yaml
grader:
  type: "model"
  config:
    model: "claude-3-5-sonnet"
    rubric: "Evaluate code review comment quality..."
    examples:
      - input: "Added console.log for debugging"
        output: "Remove debug statement before merging"
        score: 2
        justification: "Too brief, doesn't explain why or provide context"

      - input: "Added console.log for debugging"
        output: |
          Consider removing this `console.log` statement before merging.
          Debug logs can clutter production output and potentially expose
          sensitive data. If you need logging, consider using a proper
          logging library with log levels.
        score: 5
        justification: "Specific, explains why, provides alternative solution"
```

---

## Human graders

Expert evaluation when automated methods are insufficient.

**When to use:**
- Subjective quality judgments
- Novel or creative outputs
- High-stakes decisions requiring human accountability
- Calibrating automated graders
- Edge cases where automated graders fail

### Configuration

```yaml
grader:
  type: "human"
  config:
    interface: "web"                      # "web", "cli", "api"
    evaluators:
      min_required: 2                     # Minimum evaluators per item
      max_allowed: 5
      agreement_threshold: 0.8            # Inter-rater agreement required
    rating_scale:
      type: "likert"                      # "likert", "binary", "ranking"
      range: [1, 5]
      labels:
        1: "Poor"
        2: "Below Average"
        3: "Average"
        4: "Good"
        5: "Excellent"
    rubric: string                        # Detailed instructions for evaluators
    time_limit_minutes: 10                # Time allowed per evaluation
    blind_evaluation: true                # Hide metadata from evaluators
```

### Rating scales

```yaml
# Binary scale
binary_scale:
  type: "binary"
  options:
    - value: true
      label: "Pass"
      description: "Output meets requirements"
    - value: false
      label: "Fail"
      description: "Output does not meet requirements"

# Likert scale
likert_scale:
  type: "likert"
  range: [1, 5]
  labels:
    1: "Strongly Disagree"
    2: "Disagree"
    3: "Neutral"
    4: "Agree"
    5: "Strongly Agree"
  criteria:
    - "The output is accurate"
    - "The output is complete"
    - "The output is well-organized"
    - "The output is appropriate in tone"

# Ranking scale
ranking_scale:
  type: "ranking"
  description: "Rank the outputs from best to worst"
  tie_allowed: false
  min_items: 2
  max_items: 5
```

### Rubric template

```yaml
human_grader_rubric: |
  ## Evaluation Task
  You are evaluating {task_description}.

  ## Context
  - Input provided: {input_summary}
  - Task requirements: {requirements}

  ## Evaluation Criteria
  Please rate the output on each criterion below:

  ### 1. {criterion_1_name}
  {criterion_1_description}
  - What to look for: {criterion_1_indicators}
  - Common issues: {criterion_1_issues}

  ### 2. {criterion_2_name}
  ...

  ## Instructions
  1. Read the output carefully
  2. Consider each criterion independently
  3. Provide specific examples to support your ratings
  4. Note any concerns or edge cases

  ## Important Notes
  - {special_instructions}
  - If unsure, err on the side of {conservative/generous}
```
