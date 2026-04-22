# Storage format

How learned patterns are organized on disk and the schema for individual pattern files.

---

## Storage location

All learned patterns live in:
```
~/.claude/skills/learned/
```

This location is persistent across sessions, backed up with the user's home directory, and searchable during future sessions.

---

## Directory layout

```
~/.claude/skills/learned/
  ├── index.yaml                    # Pattern index for quick lookup
  ├── error_resolution/
  │   ├── typescript-null-check.yaml
  │   └── react-hook-deps.yaml
  ├── user_corrections/
  │   └── test-naming-convention.yaml
  ├── workarounds/
  │   └── jest-esm-modules.yaml
  ├── debugging_techniques/
  │   └── async-race-condition.yaml
  └── project_specific/
      └── myproject-123/
          ├── api-naming.yaml
          └── state-management.yaml
```

---

## File naming

```
{type}/{slug}.yaml

type: one of [error_resolution, user_corrections, workarounds,
              debugging_techniques, project_specific]
slug: kebab-case descriptive name derived from pattern content
```

Examples:
- `error_resolution/typescript-circular-dependency.yaml`
- `workarounds/prisma-connection-pooling.yaml`
- `project_specific/acme-corp/api-versioning.yaml`

---

## Skill file structure

Each learned skill file contains metadata, pattern content (per type), usage tracking, confidence tracking, relationships, and tags.

```yaml
# Metadata
id: "[UUID]"
type: "[pattern_type]"
created: "[ISO timestamp]"
updated: "[ISO timestamp]"
version: 1

# Pattern content (type-specific structure — see pattern-types.md)
pattern:
  # ... type-specific fields ...

# Usage tracking
usage:
  times_applied: 0
  times_successful: 0
  times_failed: 0
  last_applied: null

# Confidence tracking
confidence:
  initial: 0.7
  current: 0.7
  adjustments:
    - date: "[ISO timestamp]"
      reason: "[Why confidence changed]"
      delta: 0.0

# Relationships
related_patterns:
  - id: "[Related pattern UUID]"
    relationship: "[supersedes|supplements|conflicts]"

# Tags for retrieval
tags:
  - "[tag1]"
  - "[tag2]"
```

---

## Index file structure

The `index.yaml` file enables fast pattern lookup without reading every pattern file.

```yaml
# ~/.claude/skills/learned/index.yaml
version: 1
last_updated: "[ISO timestamp]"
pattern_count: 42

patterns:
  - id: "[UUID]"
    type: "[type]"
    file: "[relative path]"
    triggers:
      - "[trigger phrase 1]"
      - "[trigger phrase 2]"
    tags:
      - "[tag1]"
    confidence: 0.85
    project: null   # or project identifier

# Inverted index for fast lookup
trigger_index:
  "TypeError: Cannot read":
    - "[pattern-id-1]"
    - "[pattern-id-2]"
  "ECONNREFUSED":
    - "[pattern-id-3]"

tag_index:
  typescript:
    - "[pattern-id-1]"
    - "[pattern-id-4]"
  react:
    - "[pattern-id-2]"
```

---

## Pattern lifecycle

Patterns aren't static. They gain confidence through successful use, lose it through failures, and eventually get deprecated or archived.

```yaml
lifecycle:
  active: true          # Currently in use
  deprecated: false     # Superseded but kept for reference
  archived: false       # No longer relevant

  # Automatic deprecation triggers
  deprecate_if:
    - confidence_below: 0.3
    - months_unused: 12
    - failed_applications: 5
```

Patterns should be reviewed periodically (monthly is a reasonable cadence):
- Increase confidence after successful reuse
- Deprecate patterns for outdated framework versions
- Merge similar patterns to reduce duplication
