# User Stories Index Template

Template for the user stories index file at `docs/user-stories/INDEX.md`.

## INDEX.md Format

```markdown
# User Stories

Requirements index for all user story epics. **Read this file first** to identify relevant stories before diving into details.

## Epics

| Epic | Objective | Features | Status | Date |
|------|-----------|----------|--------|------|
| [EPIC-01](./EPIC-01-slug.md) | Brief objective statement | 3 | Draft | YYYY-MM-DD |
| [EPIC-02](./EPIC-02-slug.md) | Brief objective statement | 4 | Accepted | YYYY-MM-DD |

## By Category

### [Category Name]
- [EPIC-01](./EPIC-01-slug.md): One-line description
- [EPIC-02](./EPIC-02-slug.md): One-line description

### [Another Category]
- [EPIC-03](./EPIC-03-slug.md): One-line description

---

## How to Use This Index

1. **Scan the "Epics" table** to find stories relevant to your work
2. **Check "By Category"** if looking for stories in a specific area
3. **Read the Quick Reference block** (first 4 lines) of candidate epic files
4. **Read full epic file** only when you need task-level detail

## Tiered Reading Strategy

| Tier | Action | When |
|------|--------|------|
| 1 | Read this INDEX.md | Always start here |
| 2 | Read Quick Reference block (first 6 lines of epic file) | Assessing relevance |
| 3 | Read full epic file | Need task-level acceptance criteria |

## Status Legend

| Status | Meaning |
|--------|---------|
| Draft | Stories defined, not yet reviewed |
| Accepted | Reviewed and approved for implementation |
| Implemented | All tasks completed and verified |
```

## Updating INDEX.md

**When adding a new epic:**
1. Add row to "Epics" table
2. Add entry under appropriate category (create category if needed)

**When updating epic status:**
1. Update Status column in "Epics" table

**When all stories are implemented:**
1. Update status to "Implemented"
2. Consider archiving if no longer actively referenced
