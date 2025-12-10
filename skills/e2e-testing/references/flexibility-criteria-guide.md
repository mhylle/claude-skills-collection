# Flexibility Criteria Guide

How to define and evaluate flexible success criteria for E2E tests.

## Overview

Traditional E2E tests use exact matching, which breaks easily with:
- Dynamic content (timestamps, user names, IDs)
- A/B tests and feature flags
- Content changes that don't affect functionality
- Responsive layouts and UI variations

Flexibility criteria allow tests to validate **behavioral outcomes** rather than exact output.

## Flexibility Types

### 1. Exact Matching

Use for content that truly never changes.

```yaml
flexibility:
  type: exact
  criteria: "Copyright 2025 Acme Inc."
```

**When to use**:
- Legal text
- Version numbers
- Fixed identifiers
- Error codes

**Evaluation**: String comparison - must match character-for-character.

### 2. Contains Matching

Use when the target contains dynamic parts but has stable substrings.

```yaml
flexibility:
  type: contains
  criteria: "Welcome"
```

**When to use**:
- Greeting messages (`"Welcome, {username}"`)
- Status text (`"Order #12345 confirmed"`)
- Titles with dates (`"Report for January 2025"`)

**Evaluation**: Substring search - target must contain the criteria.

**Advanced contains**:
```yaml
flexibility:
  type: contains
  criteria:
    all:  # All must be present
      - "Order"
      - "confirmed"
    any:  # At least one must be present
      - "email sent"
      - "notification sent"
    none:  # Must NOT be present
      - "error"
      - "failed"
```

### 3. AI Judgment

Use for complex validation where human-like reasoning is needed.

```yaml
flexibility:
  type: ai_judgment
  criteria: "Does this page display a user dashboard with navigation menu, user profile section, and recent activity?"
```

**When to use**:
- Visual validation ("Does this look like a login page?")
- Functional validation ("Can a user understand how to proceed?")
- Complex state validation ("Is the checkout complete?")
- Accessibility validation ("Is this usable without a mouse?")

**Evaluation**: AI analyzes the page (accessibility snapshot + screenshot) against the criteria.

## Writing Effective AI Judgment Criteria

### Good Criteria

**Specific and observable**:
```yaml
criteria: "Does the page show:
  1. A heading containing 'Dashboard' or 'Home'
  2. At least 3 navigation links
  3. User's name or avatar in the header
  4. No error messages or loading spinners"
```

**Task-focused**:
```yaml
criteria: "Could a new user understand how to add an item to their cart from this page?"
```

**Behavioral**:
```yaml
criteria: "Does clicking the 'Submit' button appear to have processed the form (loading indicator, success message, or page change)?"
```

### Poor Criteria

**Too vague**:
```yaml
# BAD: What does "correct" mean?
criteria: "Is the page correct?"
```

**Too specific** (defeats the purpose):
```yaml
# BAD: Just use exact matching
criteria: "Does the page contain exactly 'Welcome back, john@example.com'?"
```

**Implementation-focused**:
```yaml
# BAD: Tests implementation, not behavior
criteria: "Does the page have a div with class 'success-container'?"
```

## Confidence Levels

AI judgments return confidence levels:

| Level | Meaning | Action |
|-------|---------|--------|
| **High** | Clear success or failure | Trust the result |
| **Medium** | Likely correct but some ambiguity | Log for review |
| **Low** | Uncertain, needs human judgment | Flag for manual review |

### Factors Affecting Confidence

**Higher confidence**:
- Clear success/error messages visible
- Expected elements present and prominent
- Page state unambiguous

**Lower confidence**:
- Partial page loads
- Ambiguous UI states
- Missing expected elements but no errors
- Complex multi-state pages

## Combining Flexibility Types

Use multiple checks for robust validation:

```yaml
steps:
  - action: verify
    target: ".checkout-confirmation"
    flexibility:
      type: contains
      criteria: "Order confirmed"
    description: "Verify confirmation text"

  - action: verify
    target: ".order-details"
    flexibility:
      type: ai_judgment
      criteria: "Does this show a valid order summary with items, quantities, and total price?"
    description: "Verify order details are complete"

  - action: verify
    target: ".order-number"
    flexibility:
      type: contains
      criteria: "ORD-"
    description: "Verify order number format"
```

## Handling Dynamic Content

### Timestamps and Dates

```yaml
# Instead of exact date matching
flexibility:
  type: contains
  criteria:
    any:
      - "January"
      - "February"
      - "March"
      # ... or use AI judgment
```

Or use AI judgment:
```yaml
flexibility:
  type: ai_judgment
  criteria: "Does the page show a recent date (within the last week)?"
```

### User-Specific Content

```yaml
flexibility:
  type: ai_judgment
  criteria: "Does this page show personalized content for a logged-in user (greeting, name, or avatar)?"
```

### Random/Generated IDs

```yaml
flexibility:
  type: contains
  criteria: "Order #"  # Just verify prefix exists
```

### A/B Test Variations

```yaml
flexibility:
  type: ai_judgment
  criteria: "Does this page provide a way to add items to the cart, regardless of button text or placement?"
```

## Mask Patterns

For screenshots, mask dynamic regions:

```yaml
steps:
  - action: screenshot
    name: "checkout-page"
    mask:
      - ".timestamp"
      - ".user-avatar"
      - ".ad-banner"
      - "[data-dynamic]"
```

## Threshold Settings

For visual comparisons:

```yaml
flexibility:
  type: visual_diff
  criteria:
    max_diff_pixels: 100
    max_diff_percent: 0.5
    ignore_colors: false
    ignore_antialiasing: true
```

## Best Practices

1. **Start with contains, escalate to AI judgment**: Contains is faster and more deterministic
2. **Write criteria as questions**: "Does this...?" format works well for AI
3. **Be specific about what matters**: List observable requirements
4. **Include negative checks**: "No error messages visible"
5. **Test your criteria**: Run manually first to validate
6. **Document ambiguous cases**: Add `known_issues` for edge cases
7. **Review low-confidence results**: They indicate criteria needs refinement

## Troubleshooting

### AI Judgment Inconsistent

**Problem**: Same page gets different results across runs.

**Solutions**:
- Make criteria more specific
- Add explicit requirements (numbered list)
- Use contains for stable parts, AI for complex parts
- Check for timing issues (page not fully loaded)

### Contains False Positives

**Problem**: Test passes when it shouldn't.

**Solutions**:
- Add `none` criteria to exclude error states
- Combine with AI judgment for context
- Use more specific substrings

### Exact Match Too Brittle

**Problem**: Test fails on minor text changes.

**Solutions**:
- Switch to contains with key phrases
- Use AI judgment for semantic validation
- Add to `known_issues` if acceptable variation
