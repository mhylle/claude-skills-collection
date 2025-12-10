# Test Regime Schema Reference

Complete YAML schema for E2E test regime files.

## File Location

Test regime files should be stored at: `tests/e2e/test_regime.yml`

## Complete Schema

```yaml
# =============================================================================
# TEST REGIME FILE
# =============================================================================
# This file defines the complete E2E test configuration for an application.
# Created and maintained by the e2e-testing skill.

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  # Required: Human-readable application name
  application: "My Application"

  # Required: Base URL for testing
  base_url: "https://app.example.com"

  # Required: Brief description of what's being tested
  description: "E-commerce platform with user auth, product catalog, and checkout"

  # Optional: Version of the application being tested
  version: "2.1.0"

  # Auto-generated: When regime was created
  created: "2025-01-15"

  # Auto-generated: Last modification date
  last_updated: "2025-01-20"

# -----------------------------------------------------------------------------
# GLOBAL SETTINGS
# -----------------------------------------------------------------------------
global_settings:
  # Capture screenshot at every step (default: true)
  screenshot_every_step: true

  # Capture network activity (default: true)
  capture_network: true

  # Capture browser console logs (default: true)
  capture_console: true

  # Capture accessibility snapshots (default: true)
  capture_accessibility: true

  # Maximum runtime discoveries per run (default: 5)
  discovery_cap: 5

  # Default timeout for actions in milliseconds (default: 30000)
  default_timeout_ms: 30000

  # Viewport settings
  viewport:
    width: 1280
    height: 720

  # Browser to use (chromium, firefox, webkit)
  browser: "chromium"

  # Run in headless mode (default: true for automated runs)
  headless: true

# -----------------------------------------------------------------------------
# BLOCKING DEPENDENCIES
# -----------------------------------------------------------------------------
# Define which scenarios block others when they fail.
# If a blocking scenario fails, dependent scenarios are marked "blocked".

blocking_dependencies:
  # Example: Login blocks all authenticated features
  - scenario: login
    blocks:
      - profile
      - settings
      - checkout
      - order-history
    reason: "Cannot test authenticated features without valid session"

  # Example: Product catalog blocks checkout
  - scenario: product-catalog
    blocks:
      - add-to-cart
      - checkout
    reason: "Need products visible to test cart and checkout"

# -----------------------------------------------------------------------------
# TEST CREDENTIALS (Optional)
# -----------------------------------------------------------------------------
# Store test account credentials. In production, use environment variables.

credentials:
  test_user:
    username: "${TEST_USERNAME}"  # Environment variable
    password: "${TEST_PASSWORD}"  # Environment variable

  admin_user:
    username: "${ADMIN_USERNAME}"
    password: "${ADMIN_PASSWORD}"

# -----------------------------------------------------------------------------
# SCENARIOS
# -----------------------------------------------------------------------------
scenarios:
  # ---------------------------------------------------------------------------
  # SCENARIO TEMPLATE
  # ---------------------------------------------------------------------------
  - scenario: "scenario-name"  # kebab-case identifier

    # Human-readable description
    description: "What this scenario tests"

    # Is this a blocking scenario? (default: false)
    blocking: false

    # Priority for execution order (lower = earlier, default: 100)
    priority: 100

    # Tags for filtering/grouping
    tags:
      - smoke
      - authentication

    # Required state before this scenario runs
    preconditions:
      - "User is on homepage"
      - "No active session"

    # Test steps (executed in order)
    steps:
      # NAVIGATE action
      - action: navigate
        target: "/login"  # Relative to base_url, or absolute URL
        description: "Go to login page"

      # WAIT action
      - action: wait
        target: "#login-form"  # CSS selector
        timeout_ms: 5000  # Override default timeout
        description: "Wait for login form to appear"

      # TYPE action
      - action: type
        target: "#username"
        value: "${credentials.test_user.username}"
        clear_first: true  # Clear field before typing (default: true)
        description: "Enter username"

      # CLICK action
      - action: click
        target: "button[type='submit']"
        description: "Click login button"

      # VERIFY action with flexibility
      - action: verify
        target: ".welcome-message"
        flexibility:
          type: contains  # exact | contains | ai_judgment
          criteria: "Welcome"
        description: "Verify welcome message appears"

      # VERIFY with AI judgment
      - action: verify
        target: ".dashboard"
        flexibility:
          type: ai_judgment
          criteria: "Does this page look like a user dashboard with navigation and user-specific content?"
        description: "Verify dashboard loaded correctly"

    # What must be true for scenario to pass
    success_criteria:
      - "User is logged in"
      - "Dashboard is visible"
      - "Welcome message contains username"

    # Alternative paths if primary fails
    alternatives:
      - name: "SSO Login"
        trigger: "Login button not found"
        steps:
          - action: click
            target: ".sso-login-button"
          - action: wait
            target: ".sso-redirect"

    # Known issues to document but not fail on
    known_issues:
      - "Slow load on first visit due to cache warming"

# -----------------------------------------------------------------------------
# DISCOVERED PATHS
# -----------------------------------------------------------------------------
# Auto-populated by the skill during runtime discovery.
# These are undocumented paths found during test execution.

discovered_paths:
  - path: "Guest checkout via footer link"
    discovered_on: "2025-01-18"
    location: "footer > a.guest-checkout"
    tested: true
    result: pass
    promoted_to_scenario: false  # Set true to add as formal scenario

  - path: "Quick reorder from order history"
    discovered_on: "2025-01-19"
    location: ".order-history .reorder-btn"
    tested: true
    result: pass
    promoted_to_scenario: true
```

## Action Reference

### Available Actions

| Action | Purpose | Required Fields | Optional Fields |
|--------|---------|-----------------|-----------------|
| `navigate` | Go to URL | `target` (URL) | `description` |
| `click` | Click element | `target` (selector) | `description`, `timeout_ms` |
| `type` | Enter text | `target`, `value` | `clear_first`, `description` |
| `wait` | Wait for element | `target` (selector) | `timeout_ms`, `description` |
| `verify` | Assert condition | `target`, `flexibility` | `description` |
| `select` | Select dropdown | `target`, `value` | `description` |
| `hover` | Hover over element | `target` | `description` |
| `scroll` | Scroll to element | `target` | `description` |
| `screenshot` | Manual screenshot | `name` | `description` |
| `pause` | Wait fixed time | `duration_ms` | `description` |

### Selector Strategies

Selectors should follow this priority:

1. **Role-based** (preferred): `role=button[name="Submit"]`
2. **Test IDs**: `[data-testid="login-btn"]`
3. **Accessible names**: `text="Login"`
4. **CSS selectors**: `.login-button`
5. **XPath** (avoid if possible): `//button[@type='submit']`

### Flexibility Types

| Type | When to Use | Example Criteria |
|------|-------------|------------------|
| `exact` | Static content that never changes | `"Welcome, John"` |
| `contains` | Content with dynamic parts | `"Welcome"` |
| `ai_judgment` | Complex or visual validation | `"Does this look like a success page?"` |

## Validation Rules

The skill validates regime files for:

1. **Required fields**: `metadata.application`, `metadata.base_url`, `scenarios`
2. **Valid YAML syntax**: Proper indentation and structure
3. **Scenario completeness**: Each scenario has `steps` and `success_criteria`
4. **Action validity**: All actions have required fields
5. **Selector format**: Selectors follow supported patterns
6. **Circular dependencies**: No blocking cycles (A blocks B blocks A)

## Best Practices

1. **Use descriptive scenario names**: `user-login` not `test1`
2. **Keep scenarios focused**: One user journey per scenario
3. **Define blocking dependencies early**: Prevents wasted test time
4. **Use environment variables for credentials**: Never commit secrets
5. **Add tags for filtering**: `smoke`, `regression`, `critical`
6. **Document known issues**: Prevents false failure investigations
7. **Review discovered paths regularly**: Promote useful ones to scenarios
