#!/usr/bin/env python3
"""
check_specs_delivered.py - deterministic gate: .specs/ artifacts are
committed on the branch before a PR is opened (GATE-02).

New script, not a TLC port - massa-ai's `implementation-delivery.md` chain has
no gate requiring `.specs/` (spec/context/design/tasks/validation, project
state, handoff, features registry) to be committed before `gh pr create`. This
turns that gap into two conjunctive, deterministic checks:

  1. `git status --porcelain -- .specs/` is empty - nothing under .specs/ is
     modified-but-uncommitted or untracked.
  2. The feature's `spec.md` (always required) plus any of
     `{context,design,tasks,validation}.md` that exist on disk, plus
     `.specs/project/STATE.md`, `.specs/HANDOFF.md`, and
     `.specs/project/FEATURES.json`, are tracked on HEAD
     (`git ls-tree -r --name-only HEAD`).

Check 2 exists because check 1 alone is not sufficient: a feature whose
`.specs/` artifacts were simply never written is porcelain-clean (nothing to
be dirty about) while still failing the actual requirement. Absence must fail,
not pass.

Pure `git` + standard library. No dependencies. Run from the project root (the
dir that contains .specs/), or pass --root.

Usage:
  python3 skills/massa-ai/scripts/check_specs_delivered.py <feature> [--root DIR]

Exit codes: 0 all required paths clean + tracked, 1 a required path is dirty,
            untracked, or not tracked on HEAD (paths named), 2 usage/git error.
"""

import argparse
import os
import subprocess
import sys

# Always required for the named feature.
FEATURE_REQUIRED = ["spec.md"]
# Required only when present on disk (not every feature reaches every phase).
FEATURE_OPTIONAL = ["context.md", "design.md", "tasks.md", "validation.md"]

STATE_FILES = [
    os.path.join(".specs", "project", "STATE.md"),
    os.path.join(".specs", "HANDOFF.md"),
    os.path.join(".specs", "project", "FEATURES.json"),
]


def _run_git(args, root):
    try:
        proc = subprocess.run(
            ["git"] + args, cwd=root, capture_output=True, text=True, check=False
        )
    except FileNotFoundError:
        print("check_specs_delivered: git not found on PATH", file=sys.stderr)
        raise SystemExit(2)
    if proc.returncode != 0:
        print(
            f"check_specs_delivered: git {' '.join(args)} failed: {proc.stderr.strip()}",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return proc.stdout


def _porcelain_dirty_paths(root):
    """Lines from `git status --porcelain -- .specs/` (empty = clean)."""
    out = _run_git(["status", "--porcelain", "--", ".specs/"], root)
    return [ln for ln in out.splitlines() if ln.strip()]


def _tracked_on_head(root):
    """Set of every path tracked on HEAD, repo-root-relative, '/'-separated."""
    out = _run_git(["ls-tree", "-r", "--name-only", "HEAD"], root)
    return set(out.splitlines())


def _resolve_feature_dir(root, feature):
    if os.path.isabs(feature) or os.sep in feature:
        return os.path.normpath(feature)
    return os.path.join(root, ".specs", "features", feature)


def required_paths(root, feature):
    """Repo-root-relative, '/'-separated paths this feature must have tracked."""
    fdir = _resolve_feature_dir(root, feature)
    fdir_rel = os.path.relpath(fdir, root)
    paths = [os.path.join(fdir_rel, name) for name in FEATURE_REQUIRED]
    if os.path.isdir(fdir):
        for name in FEATURE_OPTIONAL:
            if os.path.isfile(os.path.join(fdir, name)):
                paths.append(os.path.join(fdir_rel, name))
    paths.extend(STATE_FILES)
    return [p.replace(os.sep, "/") for p in paths]


def check(root, feature):
    """Return (errors, checked_paths). errors empty = pass."""
    errors = []

    for ln in _porcelain_dirty_paths(root):
        errors.append(f"uncommitted/untracked under .specs/: {ln.strip()}")

    paths = required_paths(root, feature)
    tracked = _tracked_on_head(root)
    for p in paths:
        if p not in tracked:
            errors.append(f"not tracked on HEAD: {p}")

    return errors, paths


def main(argv=None):
    p = argparse.ArgumentParser(
        prog="check_specs_delivered.py",
        description="Gate: .specs/ artifacts committed on the branch before PR (GATE-02).",
    )
    p.add_argument("feature", help="Feature slug under <root>/.specs/features/, or a direct path")
    p.add_argument("--root", default=".", help="Project root containing .specs/ (default: current dir)")
    args = p.parse_args(argv)
    root = os.path.abspath(args.root)

    errors, checked = check(root, args.feature)

    for e in errors:
        print(f"  ERROR {e}")
    print(f"\ncheck_specs_delivered: checked {len(checked)} path(s):")
    for c in checked:
        print(f"  - {c}")
    print(f"check_specs_delivered: {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
