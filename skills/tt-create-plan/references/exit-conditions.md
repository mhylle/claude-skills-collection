# Exit Condition Templates by Project Type

## Project Type Detection

Look for these files to identify project type:

| File | Project Type | Build | Test | Start |
|------|-------------|-------|------|-------|
| `package.json` | Node.js/TypeScript | `npm run build` | `npm test` | `npm start` |
| `pyproject.toml` or `setup.py` | Python | `pip install -e .` | `pytest` | `python -m app` |
| `Cargo.toml` | Rust | `cargo build` | `cargo test` | `cargo run` |
| `go.mod` | Go | `go build ./...` | `go test ./...` | `go run .` |
| `pom.xml` | Java/Maven | `mvn compile` | `mvn test` | `mvn exec:java` |
| `build.gradle` | Java/Gradle | `./gradlew build` | `./gradlew test` | `./gradlew run` |
| `Makefile` | Generic | `make build` | `make test` | `make run` |

## Templates

### Node.js/TypeScript

```markdown
Build Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes

Runtime Verification:
- [ ] `npm run start` or `npm run dev` starts without errors
- [ ] Server responds on expected port

Functional Verification:
- [ ] `npm test` passes
- [ ] `npm run test:e2e` passes (if applicable)
```

### Python

```markdown
Build Verification:
- [ ] `pip install -e .` succeeds
- [ ] `flake8` or `ruff` passes
- [ ] `mypy .` passes (if using type hints)

Runtime Verification:
- [ ] `python -m [module]` starts without errors
- [ ] Service responds on expected port

Functional Verification:
- [ ] `pytest` passes
- [ ] `pytest tests/integration` passes (if applicable)
```

### Go

```markdown
Build Verification:
- [ ] `go build ./...` succeeds
- [ ] `golangci-lint run` passes

Runtime Verification:
- [ ] `go run .` or compiled binary starts
- [ ] Health endpoint responds

Functional Verification:
- [ ] `go test ./...` passes
- [ ] `go test -race ./...` passes (race detection)
```

### Rust

```markdown
Build Verification:
- [ ] `cargo build` succeeds
- [ ] `cargo clippy` passes

Runtime Verification:
- [ ] `cargo run` starts without panics
- [ ] Service binds to expected port

Functional Verification:
- [ ] `cargo test` passes
- [ ] Integration tests pass
```

## Custom Exit Conditions

For each phase, also add **custom functional checks** specific to what that phase implements:

```markdown
Functional Verification:
- [ ] `npm test` passes
- [ ] Auth endpoint returns 200 on valid credentials
- [ ] Auth endpoint returns 401 on invalid credentials
- [ ] JWT token contains expected claims
```

These custom checks ensure the specific functionality of the phase works correctly, beyond just "tests pass."
