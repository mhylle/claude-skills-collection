# Verification commands — Go

Commands the 6-check verification loop runs on a Go project. Load this file when project detection says `go`.

---

## Check 1 — Build

```bash
# Standard build
go build ./...

# With all packages
go build -v ./...

# Check only (no output)
go build -n ./...
```

---

## Check 2 — Types

Go has built-in type checking during build, so Check 1 also covers basic type safety. For additional static analysis:

```bash
go build ./...

# go vet catches suspect constructs
go vet ./...

# staticcheck (recommended — more thorough)
staticcheck ./...
```

---

## Check 3 — Lint

```bash
# gofmt (formatting)
gofmt -l .
gofmt -w .      # fix

# go vet (static analysis, if not run as part of Check 2)
go vet ./...

# golangci-lint (comprehensive)
golangci-lint run

# With auto-fix
golangci-lint run --fix
```

Auto-fix pattern: run `gofmt -w .` and `golangci-lint run --fix` first, then re-run the checks without fix and assert clean.

---

## Check 4 — Tests

```bash
# Standard test
go test ./...

# Verbose
go test -v ./...

# With coverage
go test -cover ./...
go test -coverprofile=coverage.out ./...

# Specific package
go test -v ./pkg/auth/...
```

---

## Check 5 — Security (dep-vuln scan)

Go-specific:
```bash
govulncheck ./...
```

Go-specific debug-code detection:
```bash
grep -rn "fmt\.Print\|log\.Print" . --include="*.go"
```

Allowed exceptions: main-package CLI tools where stdout is the interface, logging framework calls.
