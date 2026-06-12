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
# Offline stand-ins for gh and aws. "gh issue view" prints a plausible
# fixture for issue 142; the Phase-4 PR subcommands (pr create / pr view /
# pr comment / pr checks) are offline fakes driven by seed files under
# "$SANDBOX/stub-state/" (see seed_ci_failures / seed_pr_view below).
_sandbox_write_stubs() {
  local dir="$1"
  mkdir -p "$dir/stubbin"

  cat > "$dir/stubbin/gh" <<'STUB'
#!/bin/bash
# Offline gh stub for ship-issue sandbox tests. Never touches the network.
# PR subcommands are seed-file-driven fakes under <sandbox>/stub-state/.
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SELF_DIR/../stub-state"
mkdir -p "$STATE_DIR"

cmd="${1:-} ${2:-}"
case "$cmd" in
  "issue view")
    printf '%s\n' '{"number":142,"title":"Add CSV export","url":"https://github.com/acme/widgets/issues/142","body":"Add CSV export to the reports page so analysts can download report data."}'
    exit 0
    ;;
  "auth status")
    exit 0
    ;;
  "pr create")
    # Record the FULL argv, one arg per line. Args are data, never executed.
    : > "$STATE_DIR/pr-create.argv"
    for arg in "$@"; do
      printf '%s\n' "$arg" >> "$STATE_DIR/pr-create.argv"
    done
    printf '%s\n' 'https://github.com/acme/widgets/pull/57'
    exit 0
    ;;
  "pr view")
    # If a response has been seeded (seed_pr_view), serve it; else a default
    # PR with no comments/reviews yet.
    if [ -f "$STATE_DIR/pr-view.json" ]; then
      cat "$STATE_DIR/pr-view.json"
    else
      printf '%s\n' '{"number":57,"url":"https://github.com/acme/widgets/pull/57","comments":[],"reviews":[]}'
    fi
    exit 0
    ;;
  "pr comment")
    # Append the --body value (or --body-file content) verbatim, plus a
    # newline, to comments.log. The body is DATA: it is never interpreted,
    # expanded, or executed by this stub.
    shift 2
    body=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --body)
          body="${2-}"
          shift
          [ "$#" -gt 0 ] && shift
          ;;
        --body=*)
          body="${1#--body=}"
          shift
          ;;
        --body-file)
          body="$(cat "${2:-/dev/null}")"
          shift
          [ "$#" -gt 0 ] && shift
          ;;
        --body-file=*)
          body="$(cat "${1#--body-file=}")"
          shift
          ;;
        *)
          shift
          ;;
      esac
    done
    printf '%s\n' "$body" >> "$STATE_DIR/comments.log"
    exit 0
    ;;
  "pr checks")
    # Seeded CI failures: while ci-fail-remaining holds an integer > 0,
    # decrement it, print a failing check line and exit 8 (gh's
    # failing-checks exit code). Otherwise the checks pass.
    if [ -f "$STATE_DIR/ci-fail-remaining" ]; then
      remaining="$(tr -dc '0-9' < "$STATE_DIR/ci-fail-remaining")"
      if [ -n "$remaining" ] && [ "$remaining" -gt 0 ]; then
        printf '%s\n' "$((remaining - 1))" > "$STATE_DIR/ci-fail-remaining"
        printf 'build\tfail\t1m2s\thttps://ci/run/1\n'
        exit 8
      fi
    fi
    printf 'build\tpass\t1m2s\thttps://ci/run/1\n'
    exit 0
    ;;
  "pr merge")
    # Record the FULL argv, one arg per line. Args are data, never executed.
    # Mirrors the "pr create" arm exactly: the merge is a recorded fake so
    # tests can assert WHEN (and whether) a merge was invoked, without ever
    # touching the network. Seed files do not gate it; the orchestrator is
    # expected to only call this after a Gate 2 approval.
    : > "$STATE_DIR/pr-merge.argv"
    for arg in "$@"; do
      printf '%s\n' "$arg" >> "$STATE_DIR/pr-merge.argv"
    done
    printf '%s\n' 'Merged pull request #57 (squash)'
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

# ---------------------------------------------------------------------------
# Phase-4 PR-stage stub seed helpers
#
# The gh stub's PR subcommands are driven by seed files under
# "$SANDBOX/stub-state". These helpers write those seed files. STATE_DIR is
# always "<sandbox>/stub-state" — the same directory the gh stub computes from
# its own location, so the stub and these helpers agree without any env var.
# ---------------------------------------------------------------------------

# _sandbox_state_dir <sandbox-dir>  → echoes the stub-state dir (and mkdirs it)
_sandbox_state_dir() {
  local dir="$1/stub-state"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

# seed_ci_failures <sandbox-dir> <n>
# Seed N consecutive `gh pr checks` failures: the stub decrements the counter
# and exits 8 (failing-checks) while it is > 0, then passes. N=0 (or unseeded)
# means CI passes on the first watch.
seed_ci_failures() {
  local dir state
  dir="$1"
  state="$(_sandbox_state_dir "$dir")" || return 1
  printf '%s\n' "${2:-0}" > "$state/ci-fail-remaining" || return 1
}

# seed_pr_view <sandbox-dir> <json-string>
# Seed the exact JSON `gh pr view --json ...` should print. Used to stage the
# PR's comments/reviews so the cloud-review poll loop sees a response (or, when
# left unseeded, sees an empty PR and must time out).
seed_pr_view() {
  local dir state
  dir="$1"
  state="$(_sandbox_state_dir "$dir")" || return 1
  printf '%s\n' "$2" > "$state/pr-view.json" || return 1
}

# seed_cloud_review_verdict <sandbox-dir> <author> <body>
# Convenience over seed_pr_view: stage a single cloud-review response comment
# on PR 57 so the cloud_review.py poll loop terminates with a response. <body>
# is embedded verbatim as the comment body. Use an empty/clean body for a
# "no findings" response and a findings string for a "raises blockers" one.
seed_cloud_review_verdict() {
  local dir author body json
  dir="$1"
  author="$2"
  body="$3"
  # Build the JSON via python3 so arbitrary body text (quotes, metacharacters)
  # is escaped correctly — never string-interpolated into the JSON by hand.
  json="$(python3 -c '
import json, sys
author, body = sys.argv[1], sys.argv[2]
print(json.dumps({
    "number": 57,
    "url": "https://github.com/acme/widgets/pull/57",
    "comments": [{"author": {"login": author}, "body": body}],
    "reviews": [],
}))
' "$author" "$body")" || return 1
  seed_pr_view "$dir" "$json"
}
