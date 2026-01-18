# Service Delegation & Single Responsibility Checklist

Detailed checklist for verifying proper separation of concerns and single responsibility principle.

## Controller Layer Checks

### Controllers Should Only Handle

- [ ] HTTP request parsing and validation
- [ ] Route parameter extraction
- [ ] Request body transformation to DTOs
- [ ] Response formatting and status codes
- [ ] Authentication/authorization decorators
- [ ] Swagger/OpenAPI documentation

### Controllers Should NOT Contain

- [ ] Business logic or rules
- [ ] Database queries or ORM calls
- [ ] External API calls
- [ ] Complex data transformations
- [ ] Conditional business decisions
- [ ] More than ~20-30 lines per method

### Red Flags in Controllers

```typescript
// BAD: Business logic in controller
@Post('order')
async createOrder(@Body() dto: CreateOrderDto) {
  // Controller should not calculate discounts
  const discount = dto.total > 100 ? 0.1 : 0;
  const finalPrice = dto.total * (1 - discount);
  return this.orderService.create({ ...dto, price: finalPrice });
}

// GOOD: Delegate to service
@Post('order')
async createOrder(@Body() dto: CreateOrderDto) {
  return this.orderService.create(dto);
}
```

## Service Layer Checks

### Each Service Should Have

- [ ] Single, clear responsibility (named after what it does)
- [ ] Focused methods (one action per method)
- [ ] Dependencies injected via constructor
- [ ] No direct HTTP concerns (request/response objects)

### Services Should NOT

- [ ] Handle multiple unrelated domains
- [ ] Grow beyond ~300-400 lines (consider splitting)
- [ ] Directly import other services' entities
- [ ] Contain presentation/formatting logic

### Single Responsibility Indicators

| Good Sign | Bad Sign |
|-----------|----------|
| Service name is a noun (UserService) | Service name is vague (HelperService, UtilService) |
| Methods are domain verbs (createUser, validateCredentials) | Methods are generic (process, handle, execute) |
| Handles one entity/aggregate | Handles multiple unrelated entities |
| Clear input/output contracts | Methods return different types based on conditions |

### Red Flags in Services

```typescript
// BAD: God service doing too much
@Injectable()
export class UserService {
  async createUser() { /* ... */ }
  async sendEmail() { /* ... */ }      // Should be EmailService
  async processPayment() { /* ... */ } // Should be PaymentService
  async generateReport() { /* ... */ } // Should be ReportService
}

// GOOD: Focused service
@Injectable()
export class UserService {
  constructor(
    private readonly emailService: EmailService,
    private readonly paymentService: PaymentService,
  ) {}

  async createUser() {
    const user = await this.userRepository.create(/*...*/);
    await this.emailService.sendWelcome(user);
    return user;
  }
}
```

## Repository/Data Layer Checks

### Repositories Should Only

- [ ] Perform CRUD operations
- [ ] Execute database queries
- [ ] Map between database and domain models
- [ ] Handle database-specific concerns (transactions, connections)

### Repositories Should NOT

- [ ] Contain business logic
- [ ] Make decisions about data validity
- [ ] Call external services
- [ ] Format data for presentation

## Dependency Direction

Proper dependency flow (outer depends on inner):

```
Controllers → Services → Repositories → Database
     ↓            ↓            ↓
   DTOs      Entities    ORM Models
```

### Checks

- [ ] Controllers depend on services, not repositories
- [ ] Services depend on repositories, not controllers
- [ ] No circular dependencies
- [ ] Abstractions (interfaces) owned by consumer, not provider

## Module Boundary Checks

### Each Module Should

- [ ] Export only its public API (usually the main service)
- [ ] Not expose internal implementation details
- [ ] Have clear boundaries with other modules
- [ ] Use interfaces for cross-module communication

### Cross-Module Communication

```typescript
// BAD: Module A directly uses Module B's repository
@Injectable()
export class OrderService {
  constructor(
    private readonly userRepository: UserRepository, // Wrong!
  ) {}
}

// GOOD: Module A uses Module B's public service
@Injectable()
export class OrderService {
  constructor(
    private readonly userService: UserService, // Correct
  ) {}
}
```

## Verification Commands

### Find potential god classes

```bash
# Files over 400 lines (potential god classes)
find src -name "*.ts" -exec wc -l {} + | awk '$1 > 400 {print}'
```

### Check method counts

```bash
# Classes with many methods (potential SRP violation)
grep -r "async\|public\|private" src/**/*.service.ts | wc -l
```

### Find business logic in controllers

```bash
# Look for conditional logic in controllers
grep -n "if\|switch\|for\|while" src/**/*.controller.ts
```

## Summary Checklist

### Blocking Issues (must fix)

- [ ] Business logic in controllers
- [ ] God services (>500 lines or >10 public methods)
- [ ] Repository logic in services
- [ ] Circular dependencies
- [ ] Cross-module repository access

### Warning Issues (should fix)

- [ ] Services with vague names
- [ ] Methods with multiple responsibilities
- [ ] Tight coupling between modules
- [ ] Missing interface abstractions

### Info (suggestions)

- [ ] Could extract helper methods
- [ ] Could split into smaller services
- [ ] Could improve method naming
