# Verification commands — Rust

Commands the 6-check verification loop runs on a Rust project. Load this file when project detection says `rust`.

---

## Check 1 — Build

```bash
# Debug build
cargo build

# Release build
cargo build --release

# Check only (faster)
cargo check
```

For verification, `cargo check` is usually sufficient and much faster than a full build.

---

## Check 2 — Types

Rust type-checks during compilation, so Check 1 and Check 2 effectively overlap:

```bash
cargo check

# With all features enabled
cargo check --all-features

# For all targets (lib, bin, tests, examples, benches)
cargo check --all-targets
```

---

## Check 3 — Lint

```bash
# rustfmt (formatting)
cargo fmt -- --check
cargo fmt                              # fix

# clippy (linting) — treat warnings as errors
cargo clippy -- -D warnings

# With all features
cargo clippy --all-features -- -D warnings
```

Auto-fix pattern: run `cargo fmt` first (no `--check`), then re-run `cargo fmt -- --check` and clippy and assert clean.

---

## Check 4 — Tests

```bash
# Standard test
cargo test

# With test output
cargo test -- --nocapture

# Specific tests
cargo test auth::
cargo test --package my-crate

# With all features
cargo test --all-features
```

---

## Check 5 — Security (dep-vuln scan)

Rust-specific:
```bash
cargo audit
```

Rust-specific debug-code detection:
```bash
grep -rn "println!\|dbg!\|todo!\|unimplemented!" src/ --include="*.rs"
```

`todo!()` and `unimplemented!()` are explicit markers for incomplete code — treat any of them in a production path as a fail, not a warn.
