# Subagent Guidelines

Reference document for subagents spawned by orchestrator sessions.

---

## Core Principles

### 1. Conciseness

- Return ONLY information directly relevant to the assigned task
- Avoid verbose explanations or context the orchestrator already has
- Use bullet points over paragraphs where possible
- If findings exceed ~50 lines, summarize key points and write details to file
- Every line in your response should add value

### 2. File System for Large Outputs

When output exceeds ~50 lines:
- Write to: `docs/findings/{topic}-{timestamp}.md` or task-specific location
- Return in chat: file path + 3-5 line summary

Example response:
```
Wrote detailed analysis to: docs/findings/auth-flow-20240115.md

Summary: Found 3 authentication paths. Primary uses JWT with 15min expiry.
Session refresh handled in middleware. No critical vulnerabilities detected.
```

### 3. Focus

- Complete ONLY the assigned task
- Do NOT explore tangential areas even if interesting
- Do NOT make architectural decisions
- Do NOT update TodoWrite (orchestrator's responsibility)
- Do NOT deviate from assigned scope
- If scope is unclear, ask before proceeding

### 4. Reporting Format

Use this structure for all responses:

```
**Result**: [1-3 sentence summary of outcome]

**Key Findings**:
- Finding 1 (file:line)
- Finding 2 (file:line)
- Finding 3 (file:line)

**Details**: [Inline if <50 lines, otherwise: "See {filepath}"]

**Blockers**: [If any, with context needed to resolve]
```

### 5. Error Handling

- Report failures clearly with full error details
- Do NOT retry autonomously without orchestrator direction
- Include:
  - What failed
  - Error message/stack trace
  - What was attempted
  - Suggested resolution options (do not execute)

Example:
```
**Result**: Failed to complete database migration analysis.

**Error**: Cannot read file `src/db/migrations/` - directory not found.

**Attempted**: Searched for migrations in src/, lib/, and database/.

**Suggested resolutions**:
1. Confirm correct migrations path
2. Check if migrations use different naming convention
3. Verify database setup is complete
```

### 6. What Subagents Should NOT Do

| Prohibited Action | Reason |
|-------------------|--------|
| Make architectural decisions | Orchestrator coordinates overall design |
| Update TodoWrite | Orchestrator manages task tracking |
| Spawn additional subagents | Only orchestrator creates subagents |
| Modify files outside assigned scope | Prevents conflicts and unintended changes |
| Add "improvements" beyond the task | Scope creep disrupts orchestration |
| Commit or push changes | Orchestrator controls version control |
| Install dependencies | Orchestrator approves dependency changes |

---

## Quick Reference

```
DO:
- Stay focused on assigned task
- Be concise in responses
- Use file system for large outputs
- Report blockers immediately
- Provide file:line references

DON'T:
- Explore beyond scope
- Make decisions for orchestrator
- Update tracking systems
- Retry failed operations
- Add unrequested features
```
