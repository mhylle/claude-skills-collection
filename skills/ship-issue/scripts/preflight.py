#!/usr/bin/env python3
"""ship-issue preflight check.

Validates the target repository's .claude/ship-issue.config.json against
skills/ship-issue/references/config-schema.md and checks the environment
(clean working tree, gh auth, and AWS credentials only when the config uses
ecs or cloudwatch).

Collects ALL violations, never stopping at the first. Pass: prints
"PREFLIGHT OK" and exits 0. Any violation: prints one line per violation,
"BLOCKED: <key-or-check>: <detail>", and exits 2.

stdlib only. Never creates files. Never calls the network directly (gh/aws
are subprocesses; tests stub them on PATH).
"""

import argparse
import json
import os
import subprocess
import sys

CONFIG_RELPATH = os.path.join(".claude", "ship-issue.config.json")
KNOWN_TOP_LEVEL_KEYS = (
    "staging_url",
    "deploy_command",
    "ecs",
    "log_command",
    "cloudwatch",
    "cloud_review",
    "ci",
    "tasktracker",
)


def is_nonempty_str(value):
    return isinstance(value, str) and value.strip() != ""


def is_positive_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0


def load_config(repo, violations):
    """Load and parse the config file; return the parsed dict or None."""
    path = os.path.join(repo, CONFIG_RELPATH)
    if not os.path.isfile(path):
        violations.append("config: missing at %s" % CONFIG_RELPATH)
        return None
    try:
        with open(path, encoding="utf-8") as f:
            config = json.load(f)
    except (OSError, ValueError) as ex:
        violations.append("config: does not parse as JSON: %s" % ex)
        return None
    if not isinstance(config, dict):
        violations.append("config: top-level JSON value must be an object")
        return None
    return config


def check_staging_url(config, violations):
    if "staging_url" not in config:
        violations.append("staging_url: missing")
    elif not is_nonempty_str(config["staging_url"]):
        violations.append("staging_url: must be a non-empty string")


def check_exactly_one(config, violations, cmd_key, obj_key, required_subkeys):
    """Enforce exactly one of <cmd_key> (string) / <obj_key> (object)."""
    has_cmd = cmd_key in config
    has_obj = obj_key in config
    if has_cmd and has_obj:
        violations.append(
            "%s: mutually exclusive with %s; exactly one of %s/%s is allowed"
            % (cmd_key, obj_key, cmd_key, obj_key)
        )
        return
    if not has_cmd and not has_obj:
        violations.append(
            "%s: missing; exactly one of %s/%s is required" % (cmd_key, cmd_key, obj_key)
        )
        return
    if has_cmd:
        if not is_nonempty_str(config[cmd_key]):
            violations.append("%s: must be a non-empty string" % cmd_key)
        return
    obj = config[obj_key]
    if not isinstance(obj, dict):
        violations.append("%s: must be an object" % obj_key)
        return
    for subkey in required_subkeys:
        if not is_nonempty_str(obj.get(subkey)):
            violations.append("%s.%s: missing or not a non-empty string" % (obj_key, subkey))


def check_cloud_review(config, violations):
    if "cloud_review" not in config:
        violations.append("cloud_review: missing")
        return
    cr = config["cloud_review"]
    if not isinstance(cr, dict):
        violations.append("cloud_review: must be an object")
        return
    if not is_nonempty_str(cr.get("trigger_comment")):
        violations.append("cloud_review.trigger_comment: missing or not a non-empty string")
    if not is_positive_number(cr.get("timeout_minutes")):
        violations.append("cloud_review.timeout_minutes: missing or not a positive number")


def check_ci(config, violations):
    if "ci" not in config:
        violations.append("ci: missing")
        return
    ci = config["ci"]
    if not isinstance(ci, dict):
        violations.append("ci: must be an object")
        return
    checks = ci.get("required_checks")
    if (not isinstance(checks, list) or len(checks) == 0
            or not all(is_nonempty_str(c) for c in checks)):
        violations.append("ci.required_checks: must be a non-empty array of strings")


def check_tasktracker(config, violations):
    if "tasktracker" not in config:
        return  # optional
    tt = config["tasktracker"]
    if not isinstance(tt, dict):
        violations.append("tasktracker: must be an object")
        return
    if not isinstance(tt.get("time_integration"), bool):
        violations.append("tasktracker.time_integration: must be a boolean")


def check_unknown_keys(config, violations):
    for key in config:
        if key not in KNOWN_TOP_LEVEL_KEYS:
            violations.append("%s: unknown key" % key)


def run_quiet(argv):
    """Run a subprocess, swallowing its output. Returns (rc, stdout_text)."""
    try:
        proc = subprocess.run(
            argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL, timeout=55,
        )
    except FileNotFoundError:
        return None, ""
    except subprocess.TimeoutExpired:
        return -1, ""
    return proc.returncode, proc.stdout.decode("utf-8", errors="replace")


def check_working_tree(repo, violations):
    rc, out = run_quiet(["git", "-C", repo, "status", "--porcelain"])
    if rc is None:
        violations.append("working_tree: git not found on PATH")
    elif rc != 0:
        violations.append("working_tree: `git -C %s status --porcelain` exited %d" % (repo, rc))
    elif out.strip():
        entries = len(out.strip().splitlines())
        violations.append("working_tree: not clean (%d uncommitted change(s))" % entries)


def check_gh_auth(violations):
    rc, _ = run_quiet(["gh", "auth", "status"])
    if rc is None:
        violations.append("gh_auth: gh not found on PATH")
    elif rc != 0:
        violations.append("gh_auth: `gh auth status` exited %d" % rc)


def check_aws_credentials(config, violations):
    """AWS is a dependency ONLY when the config uses ecs or cloudwatch."""
    if not isinstance(config, dict):
        return
    if "ecs" not in config and "cloudwatch" not in config:
        return
    rc, _ = run_quiet(["aws", "sts", "get-caller-identity"])
    if rc is None:
        violations.append("aws_credentials: aws not found on PATH")
    elif rc != 0:
        violations.append("aws_credentials: `aws sts get-caller-identity` exited %d" % rc)


def validate_config(config, violations):
    check_staging_url(config, violations)
    check_exactly_one(config, violations, "deploy_command", "ecs", ("cluster", "service"))
    check_exactly_one(config, violations, "log_command", "cloudwatch", ("log_group",))
    check_cloud_review(config, violations)
    check_ci(config, violations)
    check_tasktracker(config, violations)
    check_unknown_keys(config, violations)


def main(argv=None):
    parser = argparse.ArgumentParser(description="ship-issue preflight validation")
    parser.add_argument("--repo", default=".", help="target repository path (default: .)")
    args = parser.parse_args(argv)

    violations = []
    config = load_config(args.repo, violations)
    if config is not None:
        validate_config(config, violations)
    check_working_tree(args.repo, violations)
    check_gh_auth(violations)
    check_aws_credentials(config, violations)

    if violations:
        for violation in violations:
            print("BLOCKED: %s" % violation)
        return 2
    print("PREFLIGHT OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
