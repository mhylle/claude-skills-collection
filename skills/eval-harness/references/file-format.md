# Eval file format

Eval suites can be authored as YAML (preferred) or JSON. This file documents both structures plus the recommended directory layout.

---

## YAML structure

```yaml
# evals/capability/string-processing.yaml
---
schema_version: "1.0"
eval_type: "capability"

metadata:
  id: "cap-string-001"
  name: "String reversal"
  description: "Test basic string manipulation capability"
  category: "string_processing"
  tags: ["strings", "basic", "manipulation"]
  created: "2024-01-15"
  author: "eval-team"

config:
  timeout_seconds: 30
  retries: 1
  parallel: true

test_cases:
  - id: "tc-001"
    name: "Simple string"
    input:
      type: "prompt"
      content: "Reverse the string: hello"
    expected:
      type: "exact"
      value: "olleh"
    grader:
      type: "code"
      config:
        method: "exact_match"
        case_sensitive: true

  - id: "tc-002"
    name: "String with spaces"
    input:
      type: "prompt"
      content: "Reverse the string: hello world"
    expected:
      type: "exact"
      value: "dlrow olleh"
    grader:
      type: "code"
      config:
        method: "exact_match"

  - id: "tc-003"
    name: "Empty string"
    input:
      type: "prompt"
      content: "Reverse the string: ''"
    expected:
      type: "exact"
      value: ""
    grader:
      type: "code"
      config:
        method: "exact_match"

  - id: "tc-004"
    name: "Unicode string"
    input:
      type: "prompt"
      content: "Reverse the string: cafe"
    expected:
      type: "exact"
      value: "efac"
    grader:
      type: "code"
      config:
        method: "exact_match"
```

---

## JSON structure

```json
{
  "schema_version": "1.0",
  "eval_type": "regression",
  "metadata": {
    "id": "reg-api-users-001",
    "name": "Users API endpoint stability",
    "description": "Verify users API maintains response structure",
    "category": "api_stability",
    "tags": ["api", "users", "critical"],
    "criticality": "critical"
  },
  "baseline": {
    "version": "v2.3.1",
    "captured_at": "2024-01-10T12:00:00Z",
    "response": {
      "status": 200,
      "headers": {
        "content-type": "application/json"
      },
      "body": {
        "data": [],
        "meta": {
          "page": 1,
          "per_page": 20
        }
      }
    }
  },
  "test_case": {
    "input": {
      "method": "GET",
      "path": "/api/v1/users",
      "headers": {
        "Authorization": "Bearer {{TEST_TOKEN}}"
      }
    },
    "comparison": {
      "type": "structural",
      "options": {
        "ignore_values": ["data.*", "meta.total"],
        "require_keys": ["data", "meta.page", "meta.per_page"]
      }
    }
  },
  "grader": {
    "type": "code",
    "config": {
      "method": "structural_match",
      "strict": false
    }
  }
}
```

---

## Directory structure

```
evals/
├── eval-suite.yaml              # Main suite configuration
├── config/
│   ├── graders.yaml             # Grader configurations
│   └── thresholds.yaml          # Pass/fail thresholds
├── capability/
│   ├── code-generation/
│   │   ├── python-functions.yaml
│   │   ├── javascript-async.yaml
│   │   └── sql-queries.yaml
│   ├── comprehension/
│   │   ├── document-summary.yaml
│   │   └── code-explanation.yaml
│   └── reasoning/
│       ├── logic-puzzles.yaml
│       └── math-problems.yaml
├── regression/
│   ├── api/
│   │   ├── users-endpoint.yaml
│   │   └── auth-endpoint.yaml
│   └── output-quality/
│       ├── code-review-comments.yaml
│       └── documentation-generation.yaml
├── baselines/
│   ├── api-responses/
│   └── quality-scores/
└── results/
    ├── 2024-01-20/
    │   ├── run-143052.json
    │   └── run-143052.md
    └── latest -> 2024-01-20/
```
