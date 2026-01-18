# ADR Compliance Checklist

Detailed checklist for verifying architectural decision compliance and documentation.

## Pre-Review: Identify Relevant ADRs

### Step 1: Read the Index

```bash
# Always start with the index
Read("docs/decisions/INDEX.md")
```

Look for ADRs related to:
- The feature area being implemented
- Technologies being used
- Patterns being applied

### Step 2: Quick Reference Scan

```bash
# Read Quick Reference block of potentially relevant ADRs
Read("docs/decisions/ADR-NNNN-title.md", limit=10)
```

### Step 3: Full Read if Needed

Only read full ADR content if the Quick Reference indicates relevance.

## Compliance Verification

### For Each Relevant ADR

| Check | Question |
|-------|----------|
| Decision followed | Does the implementation follow the stated decision? |
| Constraints respected | Are documented constraints honored? |
| Alternatives avoided | Are rejected alternatives not being used? |
| Consequences acknowledged | Are documented trade-offs being handled? |

### Common ADR Categories to Check

| Category | What to Verify |
|----------|----------------|
| Authentication | Auth mechanism, token format, session handling |
| Database | ORM usage, query patterns, migrations |
| API Design | REST conventions, versioning, error format |
| Caching | Cache strategy, invalidation, TTLs |
| Logging | Format, levels, what to log |
| Error Handling | Exception types, error responses |
| Testing | Test types, coverage requirements |

## Detecting ADR Violations

### Authentication ADRs

```typescript
// If ADR says "Use JWT for API authentication"

// VIOLATION: Using sessions instead
req.session.userId = user.id;

// COMPLIANT: Using JWT
const token = this.jwtService.sign({ sub: user.id });
```

### Database ADRs

```typescript
// If ADR says "Use TypeORM repositories, not query builder for simple queries"

// VIOLATION: Query builder for simple find
const user = await this.dataSource
  .createQueryBuilder()
  .select('user')
  .from(User, 'user')
  .where('user.id = :id', { id })
  .getOne();

// COMPLIANT: Repository method
const user = await this.userRepository.findOne({ where: { id } });
```

### Error Handling ADRs

```typescript
// If ADR says "Use domain-specific exceptions, not generic HttpException"

// VIOLATION: Generic exception
throw new HttpException('Invalid order', 400);

// COMPLIANT: Domain exception
throw new InvalidOrderStateException('Cannot cancel shipped order');
```

## New Architectural Decisions

### When to Create a New ADR

The implementation should create a new ADR when:

- [ ] Choosing between multiple valid approaches
- [ ] Establishing a new pattern not covered by existing ADRs
- [ ] Making a technology selection (library, framework, tool)
- [ ] Deviating from the original plan for good reason
- [ ] Creating conventions that future code should follow

### What Does NOT Need an ADR

- Implementation details within established patterns
- Bug fixes
- Performance optimizations that don't change architecture
- Refactoring that preserves behavior

### Trigger Questions

Ask these questions about the implementation:

1. "Did we choose between multiple reasonable approaches?"
   - If yes → Might need ADR

2. "Are we establishing a pattern others should follow?"
   - If yes → Probably needs ADR

3. "Would a future developer wonder 'why did they do it this way?'"
   - If yes → Definitely needs ADR

4. "Does this contradict or extend an existing ADR?"
   - If yes → Needs new ADR (possibly superseding old one)

## ADR Creation Checklist

If a new ADR is needed:

### Invoke ADR Skill

```
Skill(skill="adr"): Document implementation decision.

Context: [What problem or choice arose]
Options Considered: [What alternatives were evaluated]
Decision: [What was chosen]
Rationale: [Why this choice]
Consequences: [Trade-offs and implications]
```

### Verify ADR Quality

- [ ] Quick Reference block complete (all 5 lines)
- [ ] Decision stated in one sentence
- [ ] At least 2 alternatives documented
- [ ] Consequences include positive AND negative
- [ ] INDEX.md updated

### Update Plan File

Add reference to new ADR in the plan:

```markdown
> **Implementation Note**: [Brief description of decision].
> See [ADR-NNNN](../decisions/ADR-NNNN-title.md).
```

## Cross-Reference Checks

### ADRs Should Not Contradict

```bash
# Find potential contradictions
# If implementing auth, check all auth-related ADRs
grep -l "auth\|authentication\|JWT\|session" docs/decisions/ADR-*.md
```

### Superseded ADRs

- [ ] Check if any relevant ADRs are marked "Superseded"
- [ ] Follow the replacement ADR instead
- [ ] Don't accidentally implement a deprecated decision

## Plan-ADR Synchronization

### The Plan Should Reference

- [ ] ADRs that guided the design
- [ ] ADRs created during implementation
- [ ] Deviations from planned approach (with ADR reference)

### Example Plan Section

```markdown
## Phase 2: Authentication Service

### Related Decisions
- [ADR-0012](../decisions/ADR-0012-jwt-authentication.md): JWT for API auth
- [ADR-0015](../decisions/ADR-0015-refresh-token-rotation.md): Refresh token strategy

### Implementation Notes
> Deviated from original session-based plan. See ADR-0012 for rationale.
```

## Summary Checklist

### Blocking Issues (must fix)

- [ ] Violates accepted ADR
- [ ] Uses rejected alternative without new ADR
- [ ] Contradicts documented constraints
- [ ] Missing ADR for significant architectural decision

### Warning Issues (should fix)

- [ ] ADR reference missing from plan
- [ ] New pattern not documented
- [ ] Edge case not covered by ADR being followed loosely

### Info (suggestions)

- [ ] Could reference more ADRs for context
- [ ] ADR consequences section could guide implementation better
- [ ] Related ADRs could be linked

## Verification Commands

### List all ADRs

```bash
ls docs/decisions/ADR-*.md
```

### Find ADRs mentioning a technology

```bash
grep -l "TypeORM\|PostgreSQL\|JWT" docs/decisions/ADR-*.md
```

### Check ADR statuses

```bash
grep -h "Status:" docs/decisions/ADR-*.md
```

### Find recently modified ADRs

```bash
ls -lt docs/decisions/ADR-*.md | head -5
```
