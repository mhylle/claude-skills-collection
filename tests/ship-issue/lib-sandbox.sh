#!/bin/bash
# lib-sandbox.sh — sourced sandbox library for ship-issue orchestrator tests.
#
# NOT a test. Provides make_sandbox [good|broken|conflict] which builds a
# throwaway git repo with a committed .claude/ship-issue.config.json and
# offline gh/aws stubs under "$SANDBOX/stubbin". Callers prepend
# "$SANDBOX/stubbin" to PATH so NO real gh/aws and NO network is ever touched.
#
# After make_sandbox returns, $SANDBOX (exported) holds the repo path.
# Created sandboxes are tracked in SANDBOX_LIST; call cleanup_sandboxes from
# the caller's EXIT trap.

# Track every sandbox we create so callers can clean up.
if [ -z "${SANDBOX_LIST+x}" ]; then
  SANDBOX_LIST=()
fi

cleanup_sandboxes() {
  local d
  for d in "${SANDBOX_LIST[@]}"; do
    [ -n "$d" ] && rm -rf "$d"
  done
  SANDBOX_LIST=()
}

# _sandbox_write_config <sandbox-dir> <variant>
_sandbox_write_config() {
  local dir="$1" variant="$2"
  mkdir -p "$dir/.claude"
  case "$variant" in
    good)
      cat > "$dir/.claude/ship-issue.config.json" <<'JSON'
{
  "staging_url": "http://localhost:9999",
  "deploy_command": "true",
  "log_command": "echo no-errors",
  "cloud_review": {
    "trigger_comment": "@cloud-reviewer please review",
    "timeout_minutes": 30
  },
  "ci": {
    "required_checks": ["build"]
  }
}
JSON
      ;;
    broken)
      # Multiple violations at once:
      #   - staging_url missing entirely
      #   - cloud_review missing entirely
      #   - unknown top-level key "stagin_url" (typo)
      cat > "$dir/.claude/ship-issue.config.json" <<'JSON'
{
  "stagin_url": "http://localhost:9999",
  "deploy_command": "true",
  "log_command": "echo no-errors",
  "ci": {
    "required_checks": ["build"]
  }
}
JSON
      ;;
    conflict)
      # Mutual-exclusivity violation: BOTH deploy_command AND ecs present.
      cat > "$dir/.claude/ship-issue.config.json" <<'JSON'
{
  "staging_url": "http://localhost:9999",
  "deploy_command": "true",
  "ecs": {
    "cluster": "c",
    "service": "s"
  },
  "log_command": "echo no-errors",
  "cloud_review": {
    "trigger_comment": "@cloud-reviewer please review",
    "timeout_minutes": 30
  },
  "ci": {
    "required_checks": ["build"]
  }
}
JSON
      ;;
    *)
      printf 'lib-sandbox: unknown config variant: %s\n' "$variant" >&2
      return 1
      ;;
  esac
}

# _sandbox_write_stubs <sandbox-dir>
# Offline stand-ins for gh and aws. Everything exits 0; "gh issue view"
# prints a plausible fixture for issue 142.
_sandbox_write_stubs() {
  local dir="$1"
  mkdir -p "$dir/stubbin"

  cat > "$dir/stubbin/gh" <<'STUB'
#!/bin/bash
# Offline gh stub for ship-issue sandbox tests. Never touches the network.
cmd="${1:-} ${2:-}"
case "$cmd" in
  "issue view")
    printf '%s\n' '{"number":142,"title":"Add CSV export","url":"https://github.com/acme/widgets/issues/142","body":"Add CSV export to the reports page so analysts can download report data."}'
    exit 0
    ;;
  "auth status")
    exit 0
    ;;
esac
exit 0
STUB
  chmod +x "$dir/stubbin/gh"

  cat > "$dir/stubbin/aws" <<'STUB'
#!/bin/bash
# Offline aws stub for ship-issue sandbox tests. Never touches the network.
if [ "${1:-}" = "sts" ] && [ "${2:-}" = "get-caller-identity" ]; then
  printf '%s\n' '{"Account":"000000000000"}'
fi
exit 0
STUB
  chmod +x "$dir/stubbin/aws"
}

# make_sandbox [good|broken|conflict]
# Builds a throwaway git repo (clean tree, config committed) and exports
# SANDBOX with its path. Returns non-zero on setup failure.
make_sandbox() {
  local variant="${1:-good}" dir

  dir="$(mktemp -d "${TMPDIR:-/tmp}/ship-issue-sandbox.XXXXXX")" || return 1
  SANDBOX_LIST+=("$dir")

  git -C "$dir" init -q || return 1
  git -C "$dir" config user.email "sandbox@example.invalid" || return 1
  git -C "$dir" config user.name "Sandbox Tester" || return 1
  git -C "$dir" config commit.gpgsign false || return 1

  printf '# sandbox\n' > "$dir/README.md"
  # Keep the working tree clean despite the stub bin and any run-state dirs.
  printf 'stubbin/\n.ship-issue/\n' > "$dir/.gitignore"
  git -C "$dir" add README.md .gitignore || return 1
  git -C "$dir" commit -q -m "initial commit" || return 1

  _sandbox_write_config "$dir" "$variant" || return 1
  git -C "$dir" add .claude/ship-issue.config.json || return 1
  git -C "$dir" commit -q -m "add ship-issue config ($variant)" || return 1

  _sandbox_write_stubs "$dir" || return 1

  SANDBOX="$dir"
  export SANDBOX
  printf '%s\n' "$dir"
}

# sandbox_replace_config <sandbox-dir> <json-string>
# Overwrites the sandbox config with the given JSON and commits it, keeping
# the working tree clean. Used for inline config variants (e.g. T12's
# tasktracker.time_integration as a string).
sandbox_replace_config() {
  local dir="$1" json="$2"
  printf '%s\n' "$json" > "$dir/.claude/ship-issue.config.json" || return 1
  git -C "$dir" add .claude/ship-issue.config.json || return 1
  git -C "$dir" commit -q -m "replace ship-issue config" || return 1
}
