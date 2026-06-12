#!/usr/bin/env python3
"""ship-issue cloud-review stage — mechanical half (ADR-0010 substrate split).

Posts the configured trigger comment on the PR, then polls the PR's comments
and reviews until the cloud reviewer responds or the configured timeout
elapses. This script owns ONLY the mechanics (post + poll + timeout); the
judgment over any findings stays with the Fable 5 orchestrator (per
references/prompt-rules.md and references/stage-contracts.md, Stage 6).

Outcomes (mutually exclusive):
  - A response from the reviewer is seen within timeout_minutes:
    print "CLOUD_REVIEW_RESPONSE" + the raw payload, exit 0.
  - No response within timeout_minutes:
    print "CLOUD_REVIEW_TIMEOUT" + context, exit EXIT_TIMEOUT (a DISTINCT,
    non-zero code that is NOT a hard error). A timeout is NOT a failure: the
    orchestrator consolidates it as a recorded ship-or-fix INPUT
    (run_state.py record-decision), never a BLOCKED.
  - The trigger comment cannot be posted (gh error): print "CLOUD_REVIEW_ERROR"
    + detail, exit EXIT_ERROR. THIS is the only BLOCKED condition for the stage.

Security: all gh invocations use fixed-argv subprocess (never shell=True /
os.system). The trigger comment is UNTRUSTED config text and is passed as a
single argv element — it is never interpolated into a shell. stdlib only.
"""

import argparse
import json
import subprocess
import sys
import time

EXIT_OK = 0          # a response was seen
EXIT_TIMEOUT = 5     # no response within the timeout — a consolidation input
EXIT_ERROR = 1       # the trigger comment could not be posted — BLOCKED


def post_trigger_comment(pr, body):
    """Post the trigger comment via `gh pr comment`. Returns (ok, detail).

    `body` is untrusted config text: it is passed as a single argv element to
    gh, never through a shell. --body-file would also be acceptable; a single
    argv element is equally injection-safe and avoids a temp file."""
    argv = ["gh", "pr", "comment", str(pr), "--body", body]
    try:
        proc = subprocess.run(
            argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL, timeout=55,
        )
    except FileNotFoundError:
        return False, "gh not found on PATH"
    except subprocess.TimeoutExpired:
        return False, "gh pr comment timed out"
    if proc.returncode != 0:
        return False, ("gh pr comment exited %d: %s"
                       % (proc.returncode,
                          proc.stderr.decode("utf-8", errors="replace").strip()))
    return True, ""


def fetch_pr_view(pr):
    """Run `gh pr view <pr> --json number,url,comments,reviews`. Returns the
    parsed dict, or None on any error (treated as 'no response yet')."""
    argv = ["gh", "pr", "view", str(pr), "--json",
            "number,url,comments,reviews"]
    try:
        proc = subprocess.run(
            argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL, timeout=55,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout.decode("utf-8", errors="replace"))
    except ValueError:
        return None


def reviewer_response(view, reviewer_login):
    """Return the first comment/review authored by `reviewer_login`, or None.

    A response is any comment or review whose author login matches the
    configured cloud reviewer. The trigger comment we posted is authored by the
    pipeline's own account, not the reviewer, so it never counts as a response."""
    if not isinstance(view, dict):
        return None
    for kind in ("comments", "reviews"):
        items = view.get(kind)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            author = item.get("author")
            login = author.get("login") if isinstance(author, dict) else None
            if login == reviewer_login:
                return {"kind": kind, "item": item}
    return None


def poll_until_response(pr, reviewer_login, timeout_minutes, interval_seconds):
    """Poll the PR view until a reviewer response appears or the timeout
    elapses. Returns the response dict, or None on timeout.

    The loop always polls at least once (so a response already present is seen
    even with timeout_minutes=0), then keeps polling while time remains."""
    deadline = time.monotonic() + timeout_minutes * 60.0
    while True:
        view = fetch_pr_view(pr)
        response = reviewer_response(view, reviewer_login)
        if response is not None:
            return response
        if time.monotonic() >= deadline:
            return None
        # Sleep, but never past the deadline.
        remaining = deadline - time.monotonic()
        time.sleep(min(interval_seconds, remaining) if remaining > 0 else 0)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="ship-issue cloud-review trigger + poll (mechanical half)")
    parser.add_argument("--pr", required=True, help="PR number")
    parser.add_argument("--trigger-comment", required=True,
                        help="exact comment body to post (untrusted config text)")
    parser.add_argument("--reviewer-login", required=True,
                        help="the cloud reviewer's account login to watch for")
    parser.add_argument("--timeout-minutes", required=True, type=float)
    parser.add_argument("--interval-seconds", default=15.0, type=float,
                        help="poll interval (default 15s)")
    args = parser.parse_args(argv)

    ok, detail = post_trigger_comment(args.pr, args.trigger_comment)
    if not ok:
        print("CLOUD_REVIEW_ERROR: could not post trigger comment: %s" % detail)
        return EXIT_ERROR

    response = poll_until_response(
        args.pr, args.reviewer_login, args.timeout_minutes,
        max(args.interval_seconds, 0.0))

    if response is None:
        print("CLOUD_REVIEW_TIMEOUT: no response from %s within %g minute(s)"
              % (args.reviewer_login, args.timeout_minutes))
        return EXIT_TIMEOUT

    print("CLOUD_REVIEW_RESPONSE")
    print(json.dumps(response["item"]))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
