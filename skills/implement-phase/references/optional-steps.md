# Optional steps

Steps that don't run by default. Enable explicitly via plan metadata or global settings.

---

## Overview

| Step | Skill | Purpose | Default |
|---|---|---|---|
| Security Review | `security-review` | OWASP-aligned security audit | Disabled |

`verification-loop` is **not** listed here — it's the default exit-condition check in Step 2, not optional.

Optional steps:
- Are not part of the standard pipeline execution.
- Are enabled via plan metadata (global or per-phase override).
- Insert at specific points in the pipeline.

---

## Security Review step

**Skill:** `security-review`

**Purpose:** OWASP-aligned security audit for implementations that touch sensitive operations, user data, or security-critical code paths.

**When to enable:**
- Authentication and authorization code
- User input handling and validation
- API endpoints exposed to external clients
- Secrets management and credential handling
- Payment processing or financial transactions
- Personal data processing (PII, PHI)
- Cryptographic operations

**Enable (plan metadata):**
```yaml
phase_config:
  optional_steps:
    security_review: true
```

**Insertion point:** After Step 4 (Code Review), before Step 5 (ADR Compliance). The phase pipeline becomes:

```
Step 1: Implementation
Step 2: Exit Conditions (verification-loop)
Step 3: Integration Testing
Step 4: Code Review
Step 4.5: Security Review   ← inserted when enabled
Step 5: ADR Compliance
Step 6: Plan Sync
Step 7: Prompt Archival
Step 8: Completion Report
```

**Output format:**
```
SECURITY_REVIEW_STATUS: PASS | FAIL | NEEDS_REMEDIATION
VULNERABILITIES_FOUND: [count]
SEVERITY_BREAKDOWN:
  CRITICAL: [count]
  HIGH: [count]
  MEDIUM: [count]
  LOW: [count]
ISSUES:
  - [severity] [category]: [description]
RECOMMENDATIONS: [list]
COMPLIANCE_CHECKS: [list of standards checked, e.g., OWASP Top 10]
```

**Gate:** Must PASS. NEEDS_REMEDIATION triggers fix subagents and re-review.

---

## Per-phase overrides

Enable globally but override specific phases:

```yaml
phase_config:
  optional_steps:
    security_review: true

phases:
  - name: "Database Schema"
    # Inherits security_review: true

  - name: "Static Content"
    optional_steps:
      security_review: false   # Skip for this phase
```
