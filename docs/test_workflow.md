This file can be used as inspiration. it must be updated to your use case.
It will be used as input to a testing skill.

# Workflow Testing Methodology - Research Agent

> Created: 2025-12-07
> Status: Active Testing Protocol
> Test Query: "What is happening in Aarhus next weekend?"

## CRITICAL RULES - READ BEFORE EVERY ACTION

### Rule 1: Errors MUST Be Fixed
Any error encountered is NOT a separate issue - it MUST be fixed before proceeding.

### Rule 2: Sequential Workflow Testing
- Follow the execution order of the system
- For each step, verify it works BEFORE moving to the next
- If a step fails → FIX IT before proceeding
- If a step succeeds → Move to next step

### Rule 3: Always Start from Beginning
When testing step N, you MUST:
1. Execute steps 1 through N-1 first
2. Use the actual output from previous steps as input
3. Never skip steps or use mocked data

### Rule 4: Test Query
**ALWAYS use this query**: `"What is happening in Aarhus next weekend?"`
