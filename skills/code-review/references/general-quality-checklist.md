# General Code Quality Checklist

Detailed checklist for standard code quality concerns including security, maintainability, and best practices.

## Security Checks

### Injection Prevention

| Vulnerability | What to Check |
|---------------|---------------|
| SQL Injection | Parameterized queries, no string concatenation |
| NoSQL Injection | Sanitized inputs, no `$where` with user input |
| Command Injection | No `exec`/`spawn` with user input, or properly escaped |
| XSS | Output encoding, sanitized HTML rendering |
| Path Traversal | Validated file paths, no `../` in user input |

### Examples

```typescript
// BAD: SQL injection vulnerable
const query = `SELECT * FROM users WHERE id = ${userId}`;

// GOOD: Parameterized query
const user = await this.userRepository.findOne({ where: { id: userId } });

// BAD: Command injection
exec(`ls ${userInput}`);

// GOOD: Escaped or avoided
const files = await fs.readdir(sanitizedPath);
```

### Authentication & Authorization

- [ ] Auth required on protected endpoints
- [ ] Authorization checks for resource access
- [ ] Role/permission validation where needed
- [ ] Session/token validation on each request

### Secrets Management

- [ ] No hardcoded passwords or API keys
- [ ] No secrets in code comments
- [ ] No secrets in error messages
- [ ] Sensitive data from environment variables only

```typescript
// BAD: Hardcoded secret
const apiKey = 'sk-1234567890abcdef';

// GOOD: From environment
const apiKey = this.configService.get('API_KEY');
```

### Data Exposure

- [ ] Sensitive fields excluded from responses
- [ ] Passwords never returned in API responses
- [ ] PII handling follows project requirements
- [ ] Logging doesn't include sensitive data

```typescript
// BAD: Returning password
return this.userRepository.findOne({ where: { id } });

// GOOD: Excluding sensitive fields
const user = await this.userRepository.findOne({ where: { id } });
const { password, ...safeUser } = user;
return safeUser;
```

## Error Handling

### Proper Error Handling

- [ ] Errors caught at appropriate levels
- [ ] Errors not silently swallowed
- [ ] Error messages are meaningful
- [ ] Stack traces not exposed to clients
- [ ] Async errors properly handled

### Anti-patterns

```typescript
// BAD: Swallowing errors
try {
  await riskyOperation();
} catch (e) {
  // Silent failure - BAD!
}

// BAD: Logging and rethrowing the same error
try {
  await riskyOperation();
} catch (e) {
  this.logger.error(e);
  throw e; // Will be logged again upstream
}

// GOOD: Handle or propagate with context
try {
  await riskyOperation();
} catch (e) {
  throw new OperationFailedException('Context about failure', { cause: e });
}
```

### Async Error Handling

```typescript
// BAD: Unhandled promise rejection
someAsyncOperation(); // No await, no catch

// GOOD: Properly awaited
await someAsyncOperation();

// GOOD: Fire-and-forget with error handling
someAsyncOperation().catch(e => this.logger.error('Background task failed', e));
```

## Resource Management

### Cleanup Checks

- [ ] Database connections properly managed (pool or per-request)
- [ ] File handles closed after use
- [ ] Event listeners removed when no longer needed
- [ ] Timers/intervals cleared on cleanup
- [ ] Streams properly ended

### Examples

```typescript
// BAD: Resource leak
const stream = fs.createReadStream(path);
// Stream never closed if error occurs

// GOOD: Proper cleanup
const stream = fs.createReadStream(path);
try {
  await processStream(stream);
} finally {
  stream.destroy();
}

// GOOD: Using pipeline
await pipeline(
  fs.createReadStream(input),
  transform,
  fs.createWriteStream(output),
);
```

## Code Cleanliness

### Dead Code

- [ ] No commented-out code
- [ ] No unused imports
- [ ] No unused variables
- [ ] No unreachable code
- [ ] No empty blocks without explanation

```typescript
// BAD: Commented code
// const oldImplementation = () => {
//   ...
// };

// BAD: Unused import
import { UnusedService } from './unused.service';

// BAD: Empty catch
try {
  something();
} catch (e) {
  // TODO: handle this - BAD without timeline
}

// ACCEPTABLE: Empty catch with justification
try {
  something();
} catch {
  // Intentionally ignored: operation is optional and failure is acceptable
}
```

### Code Duplication

- [ ] No copy-pasted code blocks
- [ ] Common logic extracted to shared utilities
- [ ] Similar patterns use consistent approach

### Complexity

- [ ] Methods under 30-40 lines
- [ ] Cyclomatic complexity reasonable
- [ ] Deep nesting avoided (max 3-4 levels)
- [ ] Clear control flow

```typescript
// BAD: Deep nesting
if (a) {
  if (b) {
    if (c) {
      if (d) {
        // Hard to follow
      }
    }
  }
}

// GOOD: Early returns
if (!a) return;
if (!b) return;
if (!c) return;
if (!d) return;
// Clear path
```

## Test Coverage

### New Code Should Have

- [ ] Unit tests for business logic
- [ ] Tests for error cases
- [ ] Tests for edge cases
- [ ] Integration tests for API endpoints (if applicable)

### Test Quality

- [ ] Tests actually verify behavior (not just coverage)
- [ ] Tests are independent (no order dependency)
- [ ] Tests have clear names describing what they test
- [ ] Mock/stub usage is appropriate

### Minimum Test Scenarios

| Code Type | Required Tests |
|-----------|----------------|
| Service method | Happy path, validation errors, not found, business rules |
| Controller endpoint | Success response, error responses, auth checks |
| Utility function | Normal inputs, edge cases, invalid inputs |
| Guard/Middleware | Allow case, deny case, missing data |

## Documentation

### When Comments Are Needed

- [ ] Complex algorithms explained
- [ ] Non-obvious business logic documented
- [ ] Workarounds explained with ticket/issue reference
- [ ] Public API documented (if library/shared code)

### When Comments Are NOT Needed

```typescript
// BAD: Obvious comment
// Increment counter
counter++;

// BAD: Comment repeating code
// Get user by ID
const user = await this.userService.getById(id);

// GOOD: Explaining why, not what
// Using retry because external API has intermittent failures (JIRA-1234)
const result = await retry(() => externalApi.call(), { retries: 3 });
```

## Performance Considerations

### Database Queries

- [ ] No N+1 query problems
- [ ] Appropriate indexes exist (or noted for DBA)
- [ ] Large result sets paginated
- [ ] Transactions used appropriately

### Memory

- [ ] Large collections streamed, not loaded entirely
- [ ] Circular references avoided (memory leaks)
- [ ] Caches have size limits and TTLs

### Async Operations

- [ ] Parallel operations where appropriate (`Promise.all`)
- [ ] Not awaiting in loops unnecessarily
- [ ] Background tasks don't block requests

```typescript
// BAD: Sequential when parallel is possible
for (const id of ids) {
  await processItem(id); // Each waits for previous
}

// GOOD: Parallel processing
await Promise.all(ids.map(id => processItem(id)));

// GOOD: Controlled concurrency for many items
const results = [];
for (const batch of chunk(ids, 10)) {
  results.push(...await Promise.all(batch.map(processItem)));
}
```

## Summary Checklist

### Blocking Issues (must fix)

- [ ] Security vulnerability (injection, auth bypass, etc.)
- [ ] Hardcoded secrets or credentials
- [ ] Unhandled errors that could crash application
- [ ] Resource leaks (connections, file handles)
- [ ] Missing tests for new functionality
- [ ] N+1 query problems in loops

### Warning Issues (should fix)

- [ ] Commented-out code
- [ ] Unused imports/variables
- [ ] Missing error handling for edge cases
- [ ] Code duplication
- [ ] Complex methods that could be simplified
- [ ] Missing documentation on complex logic

### Info (suggestions)

- [ ] Could improve variable naming
- [ ] Could add more specific types
- [ ] Could optimize for performance
- [ ] Could add more test scenarios
