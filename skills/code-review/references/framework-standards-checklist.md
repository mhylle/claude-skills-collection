# Framework Standards Compliance Checklist

Detailed checklist for verifying code follows project conventions and framework best practices.

## How to Use This Checklist

1. **First**, identify project conventions by:
   - Reading existing similar files
   - Checking for `.eslintrc`, `tsconfig.json`, style guides
   - Looking at established patterns in the codebase

2. **Then**, verify new code matches those conventions

## Naming Conventions

### Files

| Type | Convention | Example |
|------|------------|---------|
| Services | `{name}.service.ts` | `user.service.ts` |
| Controllers | `{name}.controller.ts` | `user.controller.ts` |
| Modules | `{name}.module.ts` | `user.module.ts` |
| DTOs | `{action}-{entity}.dto.ts` | `create-user.dto.ts` |
| Entities | `{name}.entity.ts` | `user.entity.ts` |
| Interfaces | `{name}.interface.ts` | `user.interface.ts` |
| Guards | `{name}.guard.ts` | `auth.guard.ts` |
| Pipes | `{name}.pipe.ts` | `validation.pipe.ts` |
| Tests | `{name}.spec.ts` or `{name}.test.ts` | `user.service.spec.ts` |

### Classes and Methods

- [ ] Classes: PascalCase (`UserService`, `CreateUserDto`)
- [ ] Methods: camelCase (`createUser`, `findById`)
- [ ] Private methods: prefixed or not per project convention
- [ ] Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`, `DEFAULT_TIMEOUT`)

### Check Project Convention

```bash
# See existing naming patterns
ls src/**/*.ts | head -20
```

## Module Structure

### Standard NestJS Structure

```
src/
├── {feature}/
│   ├── {feature}.module.ts
│   ├── {feature}.controller.ts
│   ├── {feature}.service.ts
│   ├── dto/
│   │   ├── create-{feature}.dto.ts
│   │   └── update-{feature}.dto.ts
│   ├── entities/
│   │   └── {feature}.entity.ts
│   └── {feature}.service.spec.ts
```

### Checks

- [ ] New files placed in correct directory
- [ ] Related files grouped in feature module
- [ ] DTOs in `dto/` subdirectory (if project uses this)
- [ ] Entities in `entities/` subdirectory (if project uses this)

## Dependency Injection

### Correct Patterns

```typescript
// GOOD: Constructor injection
@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
  ) {}
}

// GOOD: Using @Inject for tokens
constructor(
  @Inject(CACHE_MANAGER) private cacheManager: Cache,
) {}
```

### Anti-patterns

```typescript
// BAD: Property injection without decorator
@Injectable()
export class UserService {
  private userRepository: UserRepository; // Not injected!
}

// BAD: Manual instantiation
@Injectable()
export class UserService {
  private helper = new HelperService(); // Should be injected
}
```

### Checks

- [ ] All dependencies injected via constructor
- [ ] `readonly` modifier used for injected dependencies
- [ ] Correct decorators (`@Injectable()`, `@Inject()`)
- [ ] No manual `new` for injectable services

## Error Handling

### Project Pattern Detection

```bash
# Find existing error handling patterns
grep -r "throw new" src/**/*.ts | head -10
grep -r "catch" src/**/*.ts | head -10
grep -r "HttpException\|BadRequestException" src/**/*.ts | head -10
```

### Common Patterns

```typescript
// Standard NestJS exceptions
throw new BadRequestException('Invalid input');
throw new NotFoundException('User not found');
throw new UnauthorizedException('Invalid credentials');

// Custom exceptions (if project uses them)
throw new DomainException('INVALID_ORDER_STATE', 'Cannot cancel shipped order');
```

### Checks

- [ ] Uses project's exception types
- [ ] Error messages are meaningful
- [ ] Sensitive info not leaked in errors
- [ ] Async errors properly caught/propagated

## Logging

### Project Pattern Detection

```bash
# Find existing logging patterns
grep -r "Logger\|logger\|console.log" src/**/*.ts | head -10
```

### Common Patterns

```typescript
// NestJS Logger
private readonly logger = new Logger(UserService.name);
this.logger.log('User created', { userId: user.id });
this.logger.error('Failed to create user', error.stack);

// Custom logger (if project uses one)
this.logger.info('User created', { userId: user.id });
```

### Checks

- [ ] Uses project's logging solution
- [ ] Logger initialized with class context
- [ ] Appropriate log levels (error, warn, log, debug)
- [ ] Structured logging where applicable
- [ ] No `console.log` in production code

## Configuration

### Project Pattern Detection

```bash
# Find config usage patterns
grep -r "ConfigService\|process.env\|config\." src/**/*.ts | head -10
```

### Common Patterns

```typescript
// NestJS ConfigService
constructor(private readonly configService: ConfigService) {}
const dbHost = this.configService.get<string>('DB_HOST');

// With validation
const port = this.configService.getOrThrow<number>('PORT');
```

### Checks

- [ ] No hardcoded configuration values
- [ ] Uses project's config management
- [ ] Sensitive values from environment
- [ ] Type-safe config access

## Testing Patterns

### Project Pattern Detection

```bash
# Find test structure
ls src/**/*.spec.ts | head -5
cat src/**/*.spec.ts | head -50
```

### Common Structure

```typescript
describe('UserService', () => {
  let service: UserService;
  let repository: MockType<Repository<User>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useFactory: repositoryMockFactory },
      ],
    }).compile();

    service = module.get(UserService);
    repository = module.get(getRepositoryToken(User));
  });

  describe('create', () => {
    it('should create a user', async () => {
      // Arrange
      const dto = { email: 'test@example.com' };
      repository.save.mockResolvedValue({ id: 1, ...dto });

      // Act
      const result = await service.create(dto);

      // Assert
      expect(result.id).toBe(1);
      expect(repository.save).toHaveBeenCalledWith(dto);
    });
  });
});
```

### Checks

- [ ] Test file naming matches project convention
- [ ] Uses project's testing utilities/factories
- [ ] Mock patterns consistent with codebase
- [ ] Arrange/Act/Assert or Given/When/Then structure
- [ ] Descriptive test names

## Validation

### Common Patterns

```typescript
// class-validator DTOs
export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

// Validation pipe in controller
@Post()
@UsePipes(new ValidationPipe({ transform: true }))
create(@Body() dto: CreateUserDto) {}
```

### Checks

- [ ] DTOs have validation decorators
- [ ] Validation consistent with existing DTOs
- [ ] Transform options match project conventions
- [ ] Custom validators follow project patterns

## Summary Checklist

### Blocking Issues (must fix)

- [ ] File not in correct location
- [ ] Missing `@Injectable()` decorator
- [ ] Hardcoded secrets or configuration
- [ ] `console.log` in production code
- [ ] Missing validation on user input
- [ ] Test file missing for new functionality

### Warning Issues (should fix)

- [ ] Naming doesn't match convention
- [ ] Logger not using project's logger
- [ ] Config access not using ConfigService
- [ ] Test structure differs from project pattern

### Info (suggestions)

- [ ] Could use more specific exception type
- [ ] Logging could include more context
- [ ] Could add more validation
