# Test History Schema Reference

JSON schema for tracking E2E test results over time.

## File Location

History file is stored at: `tests/e2e/test_history.json`

## CRITICAL: Test Status Integrity

**The `result` field must accurately reflect test outcomes.** See SKILL.md for full details.

| Status | Meaning | When to Use |
|--------|---------|-------------|
| `pass` | Feature works as specified | Test completed successfully |
| `fail` | Feature doesn't work or doesn't exist | Test failed, element not found, feature missing, test incomplete |
| `blocked` | Cannot run due to dependency | A blocking scenario failed |
| `skipped` | **ONLY** for valid environmental reasons | Environment unavailable, platform mismatch, with ticket reference |

**Invalid uses of `skipped`** (use `fail` instead):
- Feature not implemented → `fail` with "Feature not implemented"
- Test not executed → `fail` with "Test not executed"
- Would fail anyway → `fail` (that's the point)

## Purpose

The history system enables:
- **Regression detection**: Identify tests that newly fail
- **Flaky test identification**: Find intermittently failing tests
- **Trend analysis**: Track pass rates over time
- **Variation suggestions**: Auto-generate tests for problem areas
- **Smart re-testing**: Focus extra effort on historically problematic areas

## Complete Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "E2E Test History",
  "type": "object",
  "required": ["metadata", "runs"],
  "properties": {
    "metadata": {
      "type": "object",
      "required": ["application", "created", "last_run"],
      "properties": {
        "application": {
          "type": "string",
          "description": "Application name from test regime"
        },
        "created": {
          "type": "string",
          "format": "date-time",
          "description": "When history tracking started"
        },
        "last_run": {
          "type": "string",
          "format": "date-time",
          "description": "Timestamp of most recent run"
        },
        "total_runs": {
          "type": "integer",
          "description": "Total number of recorded runs"
        },
        "retention_policy": {
          "type": "object",
          "properties": {
            "detailed_days": {
              "type": "integer",
              "default": 30,
              "description": "Days to keep detailed run data"
            },
            "summary_months": {
              "type": "integer",
              "default": 12,
              "description": "Months to keep summarized data"
            }
          }
        }
      }
    },
    "runs": {
      "type": "array",
      "description": "Individual test run records (newest first)",
      "items": {
        "$ref": "#/definitions/run"
      }
    },
    "scenario_stats": {
      "type": "object",
      "description": "Aggregated statistics per scenario",
      "additionalProperties": {
        "$ref": "#/definitions/scenario_stats"
      }
    },
    "flaky_scenarios": {
      "type": "array",
      "description": "Scenarios identified as flaky",
      "items": {
        "type": "string"
      }
    },
    "suggested_variations": {
      "type": "array",
      "description": "Auto-generated test variation suggestions",
      "items": {
        "$ref": "#/definitions/variation"
      }
    },
    "archived_summaries": {
      "type": "array",
      "description": "Summarized data for runs older than retention period",
      "items": {
        "$ref": "#/definitions/archive_summary"
      }
    }
  },
  "definitions": {
    "run": {
      "type": "object",
      "required": ["id", "timestamp", "scenarios", "summary"],
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique run identifier (UUID)"
        },
        "timestamp": {
          "type": "string",
          "format": "date-time"
        },
        "duration_ms": {
          "type": "integer",
          "description": "Total run duration in milliseconds"
        },
        "regime_hash": {
          "type": "string",
          "description": "Hash of test regime file for change detection"
        },
        "summary": {
          "type": "object",
          "properties": {
            "total": { "type": "integer" },
            "passed": { "type": "integer" },
            "failed": { "type": "integer" },
            "blocked": { "type": "integer" },
            "skipped": { "type": "integer" }
          }
        },
        "scenarios": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/scenario_result"
          }
        },
        "discoveries": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/discovery"
          }
        },
        "environment": {
          "type": "object",
          "properties": {
            "browser": { "type": "string" },
            "viewport": { "type": "string" },
            "os": { "type": "string" }
          }
        }
      }
    },
    "scenario_result": {
      "type": "object",
      "required": ["result"],
      "properties": {
        "result": {
          "type": "string",
          "enum": ["pass", "fail", "blocked", "skipped"]
        },
        "duration_ms": {
          "type": "integer"
        },
        "steps_completed": {
          "type": "integer",
          "description": "Number of steps completed before result"
        },
        "steps_total": {
          "type": "integer",
          "description": "Total steps in scenario"
        },
        "confidence": {
          "type": "string",
          "enum": ["high", "medium", "low"],
          "description": "AI judgment confidence if applicable"
        },
        "failed_step": {
          "type": "object",
          "properties": {
            "index": { "type": "integer" },
            "action": { "type": "string" },
            "error": { "type": "string" },
            "evidence_path": { "type": "string" }
          }
        },
        "alternatives_tried": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "result": { "type": "string" }
            }
          }
        },
        "retried": {
          "type": "boolean",
          "description": "Was this scenario retried after initial failure?"
        },
        "retry_result": {
          "type": "string",
          "enum": ["pass", "fail"],
          "description": "Result of retry if retried"
        }
      }
    },
    "scenario_stats": {
      "type": "object",
      "properties": {
        "total_runs": { "type": "integer" },
        "pass_count": { "type": "integer" },
        "fail_count": { "type": "integer" },
        "blocked_count": { "type": "integer" },
        "pass_rate": {
          "type": "number",
          "description": "Pass rate as decimal (0.0 to 1.0)"
        },
        "avg_duration_ms": { "type": "integer" },
        "last_pass": {
          "type": "string",
          "format": "date-time"
        },
        "last_fail": {
          "type": "string",
          "format": "date-time"
        },
        "consecutive_passes": { "type": "integer" },
        "consecutive_fails": { "type": "integer" },
        "flaky_score": {
          "type": "number",
          "description": "0.0 (stable) to 1.0 (very flaky)"
        },
        "common_failure_steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "step_index": { "type": "integer" },
              "failure_count": { "type": "integer" },
              "common_errors": {
                "type": "array",
                "items": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "variation": {
      "type": "object",
      "required": ["scenario", "variation", "reason"],
      "properties": {
        "scenario": {
          "type": "string",
          "description": "Scenario this variation is based on"
        },
        "variation": {
          "type": "string",
          "description": "Description of the suggested variation"
        },
        "reason": {
          "type": "string",
          "description": "Why this variation is suggested"
        },
        "suggested_on": {
          "type": "string",
          "format": "date-time"
        },
        "priority": {
          "type": "string",
          "enum": ["high", "medium", "low"]
        },
        "implemented": {
          "type": "boolean",
          "default": false
        },
        "implemented_as": {
          "type": "string",
          "description": "Name of scenario if implemented"
        }
      }
    },
    "discovery": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["alternative_path", "new_feature", "ui_change", "error_state"]
        },
        "description": { "type": "string" },
        "location": { "type": "string" },
        "tested": { "type": "boolean" },
        "test_result": {
          "type": "string",
          "enum": ["pass", "fail", "not_tested"]
        }
      }
    },
    "archive_summary": {
      "type": "object",
      "properties": {
        "period": {
          "type": "string",
          "description": "Month/year period (e.g., '2025-01')"
        },
        "run_count": { "type": "integer" },
        "overall_pass_rate": { "type": "number" },
        "scenario_summaries": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "runs": { "type": "integer" },
              "pass_rate": { "type": "number" }
            }
          }
        }
      }
    }
  }
}
```

## Example History File

```json
{
  "metadata": {
    "application": "Acme E-commerce",
    "created": "2025-01-01T00:00:00Z",
    "last_run": "2025-01-20T14:30:00Z",
    "total_runs": 45,
    "retention_policy": {
      "detailed_days": 30,
      "summary_months": 12
    }
  },
  "runs": [
    {
      "id": "run-2025-01-20-143000",
      "timestamp": "2025-01-20T14:30:00Z",
      "duration_ms": 125000,
      "regime_hash": "abc123def456",
      "summary": {
        "total": 10,
        "passed": 7,
        "failed": 2,
        "blocked": 1,
        "skipped": 0
      },
      "scenarios": {
        "login": {
          "result": "pass",
          "duration_ms": 3200,
          "steps_completed": 5,
          "steps_total": 5,
          "confidence": "high"
        },
        "checkout": {
          "result": "fail",
          "duration_ms": 8500,
          "steps_completed": 3,
          "steps_total": 7,
          "confidence": "high",
          "failed_step": {
            "index": 3,
            "action": "click",
            "error": "Element not found: button.complete-purchase",
            "evidence_path": "evidence/checkout/step-03/"
          },
          "alternatives_tried": [
            {
              "name": "Keyboard submit",
              "result": "fail"
            }
          ]
        },
        "order-history": {
          "result": "blocked",
          "duration_ms": 0,
          "steps_completed": 0,
          "steps_total": 4
        }
      },
      "discoveries": [
        {
          "type": "alternative_path",
          "description": "Guest checkout available via footer",
          "location": "footer > a.guest-checkout",
          "tested": true,
          "test_result": "pass"
        }
      ],
      "environment": {
        "browser": "chromium",
        "viewport": "1280x720",
        "os": "linux"
      }
    }
  ],
  "scenario_stats": {
    "login": {
      "total_runs": 45,
      "pass_count": 44,
      "fail_count": 1,
      "blocked_count": 0,
      "pass_rate": 0.978,
      "avg_duration_ms": 3100,
      "last_pass": "2025-01-20T14:30:00Z",
      "last_fail": "2025-01-05T10:00:00Z",
      "consecutive_passes": 15,
      "consecutive_fails": 0,
      "flaky_score": 0.05
    },
    "checkout": {
      "total_runs": 45,
      "pass_count": 38,
      "fail_count": 7,
      "blocked_count": 0,
      "pass_rate": 0.844,
      "avg_duration_ms": 7800,
      "last_pass": "2025-01-19T10:00:00Z",
      "last_fail": "2025-01-20T14:30:00Z",
      "consecutive_passes": 0,
      "consecutive_fails": 1,
      "flaky_score": 0.35,
      "common_failure_steps": [
        {
          "step_index": 3,
          "failure_count": 5,
          "common_errors": [
            "Element not found",
            "Timeout waiting for element"
          ]
        }
      ]
    }
  },
  "flaky_scenarios": [
    "checkout",
    "search-results"
  ],
  "suggested_variations": [
    {
      "scenario": "checkout",
      "variation": "Test checkout with slow network simulation",
      "reason": "Failed 5/45 runs, mostly timeout errors",
      "suggested_on": "2025-01-15T00:00:00Z",
      "priority": "high",
      "implemented": false
    },
    {
      "scenario": "login",
      "variation": "Test login with special characters in password",
      "reason": "Single failure involved special character password",
      "suggested_on": "2025-01-06T00:00:00Z",
      "priority": "medium",
      "implemented": true,
      "implemented_as": "login-special-chars"
    }
  ],
  "archived_summaries": [
    {
      "period": "2024-12",
      "run_count": 30,
      "overall_pass_rate": 0.92,
      "scenario_summaries": {
        "login": { "runs": 30, "pass_rate": 0.97 },
        "checkout": { "runs": 30, "pass_rate": 0.87 }
      }
    }
  ]
}
```

## Flaky Score Calculation

A scenario is considered flaky when its results are inconsistent. The flaky score is calculated:

```
flaky_score = (pass_to_fail_transitions + fail_to_pass_transitions) / (total_runs - 1)
```

**Thresholds**:
- `< 0.1`: Stable (green)
- `0.1 - 0.3`: Slightly flaky (yellow)
- `> 0.3`: Flaky (red) - added to `flaky_scenarios` list

## Variation Suggestion Rules

The system auto-suggests variations when:

1. **Repeated failures at same step** (3+ times in 10 runs):
   - Suggest timeout increase or alternative action

2. **Intermittent failures** (flaky_score > 0.2):
   - Suggest network/timing variations
   - Suggest state cleanup tests

3. **Specific error patterns**:
   - "Element not found" → Suggest alternative selectors
   - "Timeout" → Suggest wait strategy tests
   - "Session expired" → Suggest session persistence tests

4. **Discovered paths**:
   - New functionality → Suggest formal test coverage

## Retention and Archiving

### Detailed Data (Default: 30 days)
- Full run records with all scenario results
- Evidence paths and error details
- Discovery records

### Archived Summaries (Default: 12 months)
- Monthly aggregates
- Pass rates per scenario
- Run counts

### Cleanup Process

Run automatically when history is loaded:
1. Identify runs older than `detailed_days`
2. Aggregate into monthly summaries
3. Remove detailed records
4. Keep summaries for `summary_months`
5. Remove summaries older than retention

## Integration Points

### With Run Mode
- Load history before run
- Note flaky scenarios for extra logging
- Compare results to detect regressions
- Update stats after run

### With Report Mode
- Include trend data in reports
- Highlight regressions vs persistent failures
- Surface variation suggestions

### With Bug-Fix Skill (Future)
- Machine report references history for context
- Pattern analysis helps prioritize fixes
- Flaky score indicates investigation priority
