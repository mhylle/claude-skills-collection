#!/usr/bin/env bash
# Orchestrator gate for {{PROJECT_NAME}} in a clean worktree: scripts/run-orch-gate.sh <sha> <log>
# Written by /devflow:tt-create-build-loop; the build loop's gate section says when to use it.
#
# - Gates the committed <sha> in a worktree of its own, so files other agents have in flight in
#   the main tree never reach the gate.
# - One runner at a time: a lock directory (<worktree>.lock, holding the runner's pid) serialises
#   runners, and a dead runner's lock is taken over.
# - Then waits for any other gate (the project's own gate run by an agent, say). The wait lives in
#   this file, so the pattern is never on the command line that runs it: a
#   `bash -c 'while pgrep -f <pattern> ...'` matches itself and waits forever.
# - Reinstalls dependencies when a lockfile changed since the last install in the worktree.
# - The log's first line appears at once, so a caller can confirm the run has begun; its last
#   line is `gate exit=<code>`. Once it holds the lock, the runner writes <worktree>.done however it
#   exits. A refused run (exit 2) never touches the lock or the done marker.
#
# Environment: GATE_TIMEOUT (seconds, default 5400) bounds the gate; GATE_WAIT_MAX (default 10800)
# bounds the wait for another runner or gate (exit 3); GATE_POLL (default 15) is the wait's poll
# interval; ORCH_GATE_WORKTREE overrides where the worktree lives.
set -u

usage="usage: run-orch-gate.sh <sha> <log>"
sha=${1:?$usage}
log=${2:?$usage}
case "$log" in /*) ;; *) log="$PWD/$log" ;; esac
REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)" || exit 1
WORKTREE="${ORCH_GATE_WORKTREE:-{{GATE_WORKTREE}}}"
GATE_PATTERN='{{GATE_PROCESS_PATTERN}}'
LOCKFILES=({{GATE_LOCKFILES}})
DONE_FILE="$WORKTREE.done"
LOCK_DIR="$WORKTREE.lock"
POLL="${GATE_POLL:-15}"
WAIT_MAX="${GATE_WAIT_MAX:-10800}"

setup_toolchain() {
  {{GATE_TOOLCHAIN_SETUP}}
}

# Runs in the lockfile's directory.
install_deps() {
  {{GATE_INSTALL_COMMAND}}
}

# Runs at the worktree's root. Secrets come from command substitution, never pasted in.
run_gate() {
  {{GATE_COMMAND}}
}

say() { echo "run-orch-gate: $*" | tee -a "$log"; }
refuse() { echo "run-orch-gate: refused: $*" | tee -a "$log" >&2; exit 2; }

echo "run-orch-gate: $sha queued at $(date -u +%T)" > "$log"

command -v pgrep >/dev/null || refuse "pgrep is not installed"
grep -qE -- "$GATE_PATTERN" </dev/null
[ $? -eq 2 ] && refuse "GATE_PATTERN '$GATE_PATTERN' is not a valid extended regex"
printf '%s\n' "$0 $*" | grep -qE -- "$GATE_PATTERN" && refuse "GATE_PATTERN '$GATE_PATTERN' matches this script's own command line; pick one that cannot"

deadline=$(($(date +%s) + WAIT_MAX))
waited_too_long() { [ "$(date +%s)" -ge "$deadline" ]; }

# A lock whose holder is gone (killed, or died between mkdir and writing its pid) is taken over.
until mkdir "$LOCK_DIR" 2>/dev/null; do
  holder="$(cat "$LOCK_DIR/pid" 2>/dev/null)"
  if { [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; } || { [ -z "$holder" ] && [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +1 2>/dev/null)" ]; }; then
    rm -rf "$LOCK_DIR"
    continue
  fi
  waited_too_long && { say "another runner (pid ${holder:-unknown}) is still running after $WAIT_MAX s"; exit 3; }
  sleep "$POLL"
done
echo $$ > "$LOCK_DIR/pid"
rm -f "$DONE_FILE"
trap 'rc=$?; echo "Orchestrator gate $sha done at $(date -u +%H:%M) (exit $rc)" > "$DONE_FILE"; rm -rf "$LOCK_DIR"' EXIT

while :; do
  pgrep -f -- "$GATE_PATTERN" >/dev/null
  status=$?
  [ "$status" -eq 1 ] && break
  [ "$status" -ne 0 ] && { say "pgrep failed (exit $status)"; exit 1; }
  waited_too_long && { say "another gate is still running after $WAIT_MAX s"; exit 3; }
  sleep "$POLL"
done

git -C "$REPO" worktree prune
if [ ! -e "$WORKTREE" ]; then
  git -C "$REPO" worktree add -q --detach "$WORKTREE" "$sha" >> "$log" 2>&1 || { say "worktree add failed"; exit 1; }
fi
cd "$WORKTREE" && git checkout -q --detach "$sha" >> "$log" 2>&1 || { say "checkout of $sha failed"; exit 1; }
git log --oneline -1

# Some toolchain managers trip over set -u, so the set-up runs without it.
set +u
setup_toolchain
toolchain=$?
set -u
[ "$toolchain" -eq 0 ] || { say "toolchain set-up failed (exit $toolchain)"; exit 1; }

# The stamps live in the worktree's own git directory, out of the tree the gate checks.
stamps="$(git rev-parse --git-dir)/orch-install-stamps"
mkdir -p "$stamps"
for lockfile in ${LOCKFILES[@]+"${LOCKFILES[@]}"}; do
  [ -f "$lockfile" ] || { say "lockfile $lockfile is missing at $sha"; exit 1; }
  stamp="$stamps/$(echo "$lockfile" | tr '/' '_')"
  want="$(sha256sum "$lockfile" | cut -d' ' -f1)"
  if [ "$(cat "$stamp" 2>/dev/null)" != "$want" ]; then
    say "reinstalling for $lockfile (lockfile changed)"
    (cd "$(dirname "$lockfile")" && install_deps) >> "$log" 2>&1 || { say "install failed for $lockfile (see above)"; exit 1; }
    echo "$want" > "$stamp"
  fi
done

say "$sha started at $(date -u +%T)"
export -f run_gate
timeout "${GATE_TIMEOUT:-5400}" bash -c run_gate >> "$log" 2>&1
rc=$?
grep -E "^(FAIL|not ok)" "$log" | head
say "gate exit=$rc"
exit "$rc"
