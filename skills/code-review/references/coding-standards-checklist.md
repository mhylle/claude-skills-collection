# Coding Standards Compliance Checklist

Detailed checklist for verifying implementation follows project coding standards.

Reference: `docs/standards/CODING_STANDARDS.md`

## How to Use This Checklist

1. Reference the full standards document for context
2. Verify new code matches all applicable standards
3. Apply severity levels consistently
4. Provide BAD/GOOD examples when citing violations

---

## File Size Checks

### Size Thresholds

| File Type | Warning | Blocking | Action |
|-----------|---------|----------|--------|
| Service | >300 lines | >500 lines | Split into focused services |
| Controller | >150 lines | >250 lines | Extract to sub-controllers |
| Module | >50 lines | >100 lines | Review imports |
| Test file | >400 lines | >600 lines | Split by feature |
| Utility | >200 lines | >300 lines | Create utility modules |

### Verification

- [ ] No service exceeds 500 lines
- [ ] No controller exceeds 250 lines
- [ ] No test file exceeds 600 lines
- [ ] Files approaching limits flagged for future splitting

### Detection Command

```bash
# List files exceeding thresholds
find src -name "*.ts" -exec wc -l {} + | sort -rn | head -20

# Find services over 500 lines
find src -name "*.service.ts" -exec wc -l {} + | awk '$1 > 500 {print}'

# Find controllers over 250 lines
find src -name "*.controller.ts" -exec wc -l {} + | awk '$1 > 250 {print}'
```

---

## Interface Requirements

### Mandatory Interfaces

| Scenario | Required | Severity |
|----------|----------|----------|
| DTOs for request/response | Yes | **BLOCKING** |
| Cross-module contracts | Yes | **BLOCKING** |
| External API responses | Yes | **BLOCKING** |
| Service public method return types | Yes | WARNING |
| Configuration objects | Yes | WARNING |

### Interface Naming Conventions

| Type | Convention | Example | Severity |
|------|------------|---------|----------|
| DTOs | `{Action}{Entity}Dto` | `CreateUserDto` | WARNING |
| Response types | `{Entity}Response` | `UserResponse` | WARNING |
| Service interfaces | `I{Service}` | `IUserService` | INFO |
| Config interfaces | `{Feature}Config` | `DatabaseConfig` | INFO |

### Verification

- [ ] All DTOs have interface definitions
- [ ] Cross-module communication uses contracts
- [ ] External API responses are typed
- [ ] Interface naming follows conventions

### Red Flags

```typescript
// BAD: No interface for DTO
@Post('user')
async createUser(@Body() body: any) { // BLOCKING: untyped
  return this.userService.create(body);
}

// GOOD: Properly typed
@Post('user')
async createUser(@Body() dto: CreateUserDto): Promise<UserResponse> {
  return this.userService.create(dto);
}
```

---

## Error Handling

### Required Patterns

| Check | Criterion | Severity |
|-------|-----------|----------|
| No swallowed errors | Empty catch blocks | **BLOCKING** |
| Async errors handled | All promises awaited or caught | **BLOCKING** |
| Domain exceptions | Not generic HttpException | WARNING |
| Error messages | Meaningful, no stack traces exposed | WARNING |
| External API calls | Try-catch with retry/fallback | WARNING |

### Verification

- [ ] No empty catch blocks
- [ ] All async operations properly awaited
- [ ] Domain-specific exceptions used
- [ ] Error messages are meaningful
- [ ] External calls have error handling

### Anti-Patterns

```typescript
// BLOCKING: Swallowed error
try {
  await riskyOperation();
} catch (e) {
  // Empty catch - silent failure
}

// BLOCKING: Unhandled promise
someAsyncOperation(); // Fire and forget without catch

// WARNING: Generic exception
throw new HttpException('Error', 400);

// GOOD: Domain exception
throw new InvalidOrderStateException('Cannot cancel shipped order');

// GOOD: Proper error handling
try {
  await externalApiCall();
} catch (error) {
  this.logger.error('External API failed', { error });
  throw new ExternalServiceException('Payment provider unavailable');
}
```

### Detection Commands

```bash
# Find empty catch blocks
grep -rn "catch.*{" src/ --include="*.ts" -A 1 | grep -B 1 "^--$\|^\s*}$"

# Find unhandled promises (basic check)
grep -rn "\.then(" src/ --include="*.ts" | grep -v "\.catch"
```

---

## Framework Standards (NestJS)

### Dependency Injection

| Check | Criterion | Severity |
|-------|-----------|----------|
| `@Injectable()` on services | Present | **BLOCKING** |
| Constructor injection | Uses `readonly` modifier | WARNING |
| No manual `new` | For injectable services | **BLOCKING** |
| Custom tokens | Use `@Inject()` | WARNING |

### Verification

- [ ] All services have `@Injectable()` decorator
- [ ] Dependencies use `readonly` in constructor
- [ ] No `new ServiceName()` for DI services
- [ ] Module providers properly configured

### Red Flags

```typescript
// BLOCKING: Missing @Injectable
export class UserService { // Missing decorator!
  constructor(private readonly repo: UserRepository) {}
}

// BLOCKING: Manual instantiation
const emailService = new EmailService(); // Should be injected

// WARNING: Missing readonly
constructor(private userRepo: UserRepository) {} // Add readonly

// GOOD: Proper DI
@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}
}
```

---

## Logging Standards

### Requirements

| Check | Criterion | Severity |
|-------|-----------|----------|
| No `console.log` | In production code | **BLOCKING** |
| Project logger used | Logger class | WARNING |
| Class context | `new Logger(ClassName.name)` | INFO |
| Structured logging | Objects, not string concat | INFO |
| No sensitive data | Passwords, tokens, PII | **BLOCKING** |

### Verification

- [ ] No `console.log` in production code
- [ ] Logger initialized with class context
- [ ] No sensitive data logged
- [ ] Structured logging format used

### Red Flags

```typescript
// BLOCKING: console.log in production
console.log('User created'); // Remove or replace

// BLOCKING: Sensitive data logged
this.logger.log('Login', { password: user.password }); // Never log passwords!

// WARNING: Missing context
const logger = new Logger(); // Add class name

// GOOD: Proper logging
private readonly logger = new Logger(UserService.name);
this.logger.log('User created', { userId: user.id, email: user.email });
```

### Detection Command

```bash
# Find console.log in production code
grep -rn "console\.log" src/ --include="*.ts" --exclude="*.spec.ts"
```

---

## Configuration Standards

### Requirements

| Check | Criterion | Severity |
|-------|-----------|----------|
| No hardcoded config | Values from ConfigService | **BLOCKING** |
| No hardcoded secrets | API keys, passwords | **BLOCKING** |
| Type-safe config | Typed config access | WARNING |
| Environment variables | For sensitive values | WARNING |

### Verification

- [ ] No hardcoded URLs, ports, or credentials
- [ ] ConfigService used for all configuration
- [ ] Sensitive values from environment only
- [ ] Configuration is typed

### Red Flags

```typescript
// BLOCKING: Hardcoded secrets
const apiKey = 'sk-1234567890abcdef'; // Never hardcode!

// BLOCKING: Hardcoded config
const dbHost = 'localhost:5432'; // Use ConfigService

// WARNING: Untyped config
const port = this.configService.get('PORT'); // Add type

// GOOD: Proper configuration
const apiKey = this.configService.get<string>('API_KEY');
const dbConfig = this.configService.get<DatabaseConfig>('database');
```

### Detection Command

```bash
# Find potential hardcoded secrets
grep -rn "apiKey\|password\|secret\|token" src/ --include="*.ts" | grep -v "\.spec\.ts\|\.d\.ts"
```

---

## Summary Checklist

### Blocking Issues (must fix)

- [ ] File exceeds hard size limit (service >500, controller >250)
- [ ] Missing DTOs or response type interfaces
- [ ] Swallowed errors (empty catch blocks)
- [ ] Unhandled promises
- [ ] Missing `@Injectable()` decorator
- [ ] Manual `new` for injectable services
- [ ] `console.log` in production code
- [ ] Hardcoded secrets or configuration
- [ ] Sensitive data in logs

### Warning Issues (should fix)

- [ ] Files approaching size limits
- [ ] Missing return type interfaces on services
- [ ] Generic exception types
- [ ] Missing `readonly` on injected dependencies
- [ ] Untyped configuration access
- [ ] Logger without class context

### Info (suggestions)

- [ ] Could improve interface naming
- [ ] Could add more specific types
- [ ] Could use structured logging
- [ ] Could add JSDoc comments
