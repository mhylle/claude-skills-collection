# Coding Standards

This document defines mandatory coding standards enforced during implementation.

## How Standards Are Enforced

| Stage | Mechanism | Failure Mode |
|-------|-----------|--------------|
| Implementation | Subagent prompts include standards | Code rejected at creation |
| Verification | code-review checklist | BLOCKING issues prevent phase completion |
| Passive Context | CLAUDE.md snippet | Standards applied every turn |

---

## 1. Service Delegation Patterns

### 1.1 Controller Responsibilities (THIN CONTROLLERS)

Controllers handle HTTP concerns ONLY:
- Request parsing and validation
- Response formatting and status codes
- Route parameter extraction
- Authentication/authorization decorators

Controllers MUST NOT contain:
- Business logic or calculations
- Database queries
- External API calls
- Conditional business decisions

**Maximum**: ~20-30 lines per controller method

#### BAD Example
```typescript
@Post('order')
async createOrder(@Body() dto: CreateOrderDto) {
  // VIOLATION: Business logic in controller
  const discount = dto.total > 100 ? 0.1 : 0;
  const finalPrice = dto.total * (1 - discount);
  await this.db.orders.insert({ ...dto, price: finalPrice });
  return { success: true };
}
```

#### GOOD Example
```typescript
@Post('order')
async createOrder(@Body() dto: CreateOrderDto) {
  return this.orderService.create(dto);
}
```

### 1.2 Service Responsibilities

Each service has ONE clear responsibility:
- Named after what it does (noun: `UserService`, `OrderService`)
- Methods are domain verbs (`createUser`, `processPayment`)
- Dependencies injected via constructor
- No HTTP concerns (request/response objects)

Services MUST NOT:
- Handle multiple unrelated domains
- Exceed ~300-400 lines (split if larger)
- Contain presentation/formatting logic
- Directly access other services' repositories

#### Size Thresholds

| Metric | Warning | Blocking |
|--------|---------|----------|
| Lines per service | >300 | >500 |
| Public methods | >8 | >12 |
| Constructor dependencies | >5 | >8 |

---

## 2. File Size and Module Structure

### 2.1 File Size Limits

| File Type | Soft Limit | Hard Limit | Action |
|-----------|------------|------------|--------|
| Service | 300 lines | 500 lines | Split into focused services |
| Controller | 150 lines | 250 lines | Extract to sub-controllers |
| Module | 50 lines | 100 lines | Review imports |
| Test file | 400 lines | 600 lines | Split by feature |
| Utility | 200 lines | 300 lines | Create utility modules |

### 2.2 Module Boundaries

Each module MUST:
- Export only its public API (main service)
- Not expose internal implementation details
- Use interfaces for cross-module communication
- Have clear boundaries with other modules

#### BAD: Cross-module repository access
```typescript
@Injectable()
export class OrderService {
  constructor(
    private readonly userRepository: UserRepository, // VIOLATION
  ) {}
}
```

#### GOOD: Module boundary respected
```typescript
@Injectable()
export class OrderService {
  constructor(
    private readonly userService: UserService, // Correct
  ) {}
}
```

---

## 3. Interface Usage Requirements

### 3.1 When Interfaces Are MANDATORY

| Scenario | Required Interface |
|----------|-------------------|
| Service public methods | Return types |
| Cross-module communication | DTOs and contracts |
| External API responses | Response types |
| Configuration objects | Config interfaces |
| Repository methods | Entity and filter types |

### 3.2 Interface Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| DTOs | `{Action}{Entity}Dto` | `CreateUserDto` |
| Response types | `{Entity}Response` | `UserResponse` |
| Service interfaces | `I{Service}` | `IUserService` |
| Config interfaces | `{Feature}Config` | `DatabaseConfig` |

### 3.3 Interface Location

- Shared interfaces: `src/shared/interfaces/`
- Module-specific: `src/{module}/interfaces/`
- DTOs: `src/{module}/dto/`

---

## 4. Error Handling Patterns

### 4.1 Exception Hierarchy

Use domain-specific exceptions, not generic `HttpException`:

```typescript
// VIOLATION: Generic exception
throw new HttpException('Invalid order', 400);

// CORRECT: Domain exception
throw new InvalidOrderStateException('Cannot cancel shipped order');
```

### 4.2 Required Error Handling

| Scenario | Required Handling |
|----------|-------------------|
| External API calls | Try-catch with retry/fallback |
| Database operations | Transaction boundaries |
| User input | Validation exceptions |
| Business rules | Domain exceptions |
| Async operations | Proper await or catch |

### 4.3 Forbidden Patterns

```typescript
// VIOLATION: Swallowed error
try {
  await riskyOperation();
} catch (e) {
  // Silent failure - BLOCKING
}

// VIOLATION: Unhandled promise
someAsyncOperation(); // No await, no catch - BLOCKING
```

---

## 5. Framework-Specific Guidelines

### 5.1 NestJS Standards

#### Dependency Injection
- All services use `@Injectable()` decorator
- Dependencies via constructor injection with `readonly`
- Use `@Inject()` for custom tokens
- No manual `new` for injectable services

#### Module Structure
```
src/{feature}/
├── {feature}.module.ts
├── {feature}.controller.ts
├── {feature}.service.ts
├── dto/
│   ├── create-{feature}.dto.ts
│   └── update-{feature}.dto.ts
├── entities/
│   └── {feature}.entity.ts
└── {feature}.service.spec.ts
```

### 5.2 Logging Standards

- Use project's logger, not `console.log`
- Logger initialized with class context
- Structured logging with correlation IDs
- No sensitive data in logs

```typescript
// CORRECT
private readonly logger = new Logger(UserService.name);
this.logger.log('User created', { userId: user.id });

// VIOLATION: console.log in production code - BLOCKING
console.log('User created');
```

### 5.3 Configuration

- No hardcoded configuration values
- Use `ConfigService` for all config
- Sensitive values from environment only
- Type-safe config access

---

## 6. Verification Commands

### Quick Check Commands
```bash
# Find god classes (>400 lines)
find src -name "*.ts" -exec wc -l {} + | awk '$1 > 400 {print}'

# Find business logic in controllers
grep -rn "if\|switch\|for\|while" src/**/*.controller.ts

# Find console.log in production code
grep -rn "console\.log" src/ --include="*.ts" --exclude="*.spec.ts"

# Find files exceeding size limits
find src -name "*.ts" -exec wc -l {} + | sort -rn | head -20
```

---

## Severity Reference

| Level | Meaning | Phase Impact |
|-------|---------|--------------|
| **BLOCKING** | Must fix immediately | Phase cannot complete |
| **WARNING** | Should fix | Note for follow-up |
| **INFO** | Suggestion | Optional enhancement |

### BLOCKING Issues
- Business logic in controllers
- God services (>500 lines or >12 public methods)
- Missing error handling (swallowed errors, unhandled promises)
- `console.log` in production code
- Hardcoded secrets or configuration
- Cross-module repository access
- Missing interfaces on DTOs and response types
- Missing `@Injectable()` decorator on services

### WARNING Issues
- Services approaching size limits (300-500 lines)
- Missing JSDoc on complex methods
- Inconsistent naming conventions
- Tight coupling between modules
- Generic exception types instead of domain exceptions

### INFO Issues
- Could extract helper methods
- Could improve variable naming
- Could add more specific types
- Could add additional logging
