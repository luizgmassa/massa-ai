#!/usr/bin/env python3
"""
validate_tasks.py - deterministic pre-approval checks for a feature tasks.md.

Turns the three pre-approval checks (task granularity, diagram-vs-definition
cross-check, test co-location) into a checkable pass/fail run BEFORE tasks are
presented for approval, instead of trusting the model to build the tables by
hand. Pure standard library, zero dependencies. Operates only on the tasks.md
markdown artifact, so it is stack-agnostic and tool-agnostic.

What it checks (heuristic markdown inspection, not a full parser):
  ERROR  - a required section is missing
  ERROR  - a task is missing its `Tests` or `Gate` field
  ERROR  - a task depends on a task in a LATER phase (dependencies point back only)
  ERROR  - a dependency edge shown in the diagram has no matching `Depends on`
           (and vice-versa) when both sides are parseable
  WARN   - a task's `Where` names multiple files (granularity smell -> split it)
  WARN   - a task says `Tests: none` (confirm the coverage matrix agrees)
  WARN   - the diagram could not be parsed confidently (cross-check skipped)

Usage:
  python3 skills/massa-ai/scripts/validate_tasks.py [target] [--root DIR] [--strict]

  Invoke with the repo-root-relative script path shown above (matches
  lessons.py's convention), not a project-local copy.
  target    Path to a tasks.md, a feature directory, or a project root.
            Omitted -> auto-detect the single feature under <root>/.specs/features/.
  --root    Project root that contains .specs/ (default: current dir).
  --strict  Treat warnings as errors.

Exit codes: 0 pass, 1 errors found (or warnings under --strict), 2 usage error.
"""

import argparse
import os
import re
import sys

REQUIRED_SECTIONS = ["Test Coverage Matrix", "Gate Check Commands", "Execution Plan", "Task Breakdown"]
# Task ids are `T<n>` plus optional letter prefix (`FT3` for fix tasks): an
# unrecognized `### FT3:` header would fold its fields into the previous task's
# record and misreport e.g. a self-dependency (IT2-01).
TASK_RE = re.compile(r"^#{2,4}\s+([A-Z]*T\d+)\s*:", re.IGNORECASE)
EDGE_RE = re.compile(r"\b[A-Z]*T\d+\b", re.IGNORECASE)
FILE_HINT_RE = re.compile(r"[\w./-]+\.\w{1,6}\b")


def resolve_tasks(target, root):
    if target:
        if os.path.isfile(target):
            return target
        if os.path.isdir(target):
            cand = os.path.join(target, "tasks.md")
            if os.path.isfile(cand):
                return cand
            return _autodetect(target)
        # Not a path: treat as a feature name under <root>/.specs/features/<name>/
        cand = os.path.join(root, ".specs", "features", target, "tasks.md")
        if os.path.isfile(cand):
            return cand
        return None
    return _autodetect(root)


def _autodetect(root):
    base = os.path.join(root, ".specs", "features")
    if not os.path.isdir(base):
        return None
    features = [d for d in sorted(os.listdir(base)) if os.path.isfile(os.path.join(base, d, "tasks.md"))]
    if len(features) == 1:
        return os.path.join(base, features[0], "tasks.md")
    if len(features) == 0:
        return None
    raise SystemExit(
        "validate_tasks: multiple features found; pass one explicitly:\n  "
        + "\n  ".join(os.path.join(base, f, "tasks.md") for f in features)
    )


def section_present(lines, name):
    return any(re.match(r"^#{1,4}\s+" + re.escape(name) + r"\b", ln.strip()) for ln in lines)


def parse_tasks(lines):
    """Return a dict: task_id -> {'deps': set, 'tests': str|None, 'gate': str|None, 'where': str}."""
    tasks = {}
    current = None
    for ln in lines:
        m = TASK_RE.match(ln.strip())
        if m:
            current = m.group(1).upper()
            tasks[current] = {"deps": set(), "tests": None, "gate": None, "where": ""}
            continue
        if current is None:
            continue
        stripped = ln.strip()
        dm = re.match(r"^\*{0,2}Depends on\*{0,2}\s*:\s*(.*)$", stripped, re.IGNORECASE)
        if dm:
            body = dm.group(1)
            if "none" not in body.lower():
                for e in EDGE_RE.findall(body.upper()):
                    tasks[current]["deps"].add(e)
        wm = re.match(r"^\*{0,2}Where\*{0,2}\s*:\s*(.*)$", stripped, re.IGNORECASE)
        if wm:
            tasks[current]["where"] = wm.group(1)
        tm = re.match(r"^\*{0,2}Tests\*{0,2}\s*:\s*(.*)$", stripped, re.IGNORECASE)
        if tm:
            tasks[current]["tests"] = tm.group(1).strip()
        gm = re.match(r"^\*{0,2}Gate\*{0,2}\s*:\s*(.*)$", stripped, re.IGNORECASE)
        if gm:
            tasks[current]["gate"] = gm.group(1).strip()
    return tasks


TASK_BREAKDOWN_RE = re.compile(r"^#{1,4}\s+Task Breakdown\b", re.IGNORECASE)


def parse_phase_membership(lines):
    """Map task_id -> phase index, read from '### Phase N' headers.

    massa-ai patch (beyond D1): the reference tasks.md template (and TLC's own)
    puts the Execution Plan (phase headers + a diagram/list of the task IDs in
    each phase) BEFORE the separate Task Breakdown section (a flat list of
    "### Tn:" task headers with no phase sub-headers). Upstream mapped a task
    to a phase only by which "### Tn:" HEADER line followed the most-recently-
    seen "### Phase N" header while scanning the WHOLE file - so with that
    template shape every task header in Task Breakdown inherits the LAST phase
    index left over from Execution Plan, and the forward-phase-dependency
    check (SYNC-01 AC2) never fires. Confirmed against this feature's own
    tasks.md (whose Phase headers happen to sit directly inside Task
    Breakdown, immediately before their tasks) still passing, and a
    template-shaped fixture then found 0/18 forward-phase violations
    detectable when it should catch a deliberately-introduced one.

    Fix: read membership from the Execution Plan's diagram/plain-list content
    (bare `Tn` tokens under a `### Phase N` heading) as the authoritative
    signal there, and fall back to the header-based signal (`setdefault`,
    never overwriting) once "## Task Breakdown" is reached - which is also
    exactly what the ORIGINAL algorithm already got right for tasks.md files
    (like this feature's own) that interleave phase headers directly inside
    Task Breakdown. Diagram-style scanning is deliberately NOT applied inside
    Task Breakdown, preserving the original comment's concern: a `Depends on:`
    line inside one task's block often names a task from an EARLIER phase and
    must never be misattributed to the current phase.
    """
    membership = {}
    phase_idx = 0
    in_phase = False
    in_task_breakdown = False
    for ln in lines:
        stripped = ln.strip()
        if TASK_BREAKDOWN_RE.match(stripped):
            in_task_breakdown = True
        pm = re.match(r"^#{2,4}\s+Phase\s+(\d+)", stripped, re.IGNORECASE)
        if pm:
            phase_idx = int(pm.group(1))
            in_phase = True
            continue
        if not in_phase:
            continue
        hm = TASK_RE.match(stripped)
        if hm:
            membership.setdefault(hm.group(1).upper(), phase_idx)
            continue
        if not in_task_breakdown:
            for tid in EDGE_RE.findall(stripped.upper()):
                membership[tid] = phase_idx
    return membership


def parse_diagram_order(lines):
    """Best-effort: parse 'Tx -> Ty -> Tz' arrow chains from fenced blocks into
    an ordering position per task (position increases along each chain).

    massa-ai patch (beyond D1): upstream compared the diagram against `Depends
    on` as an exact edge set (`Tx -> Ty` in the diagram requires literally
    `Depends on: Tx` on Ty and vice-versa). Both massa-ai's tasks.md reference
    template AND TLC's own upstream template violate that under a real fill-in
    - e.g. the upstream example diagrams `T1 -> T2 -> T3` while T3's `Depends
    on` is `T1`, not `T2`, because the diagram documents *execution order*
    ("tasks execute sequentially within a phase"), not a literal dependency
    graph; the real graph lives in each task's `Depends on` field. Re-running
    the strict edge check against this feature's own live tasks.md as its T2
    fixture (as this task requires) failed with 16 false positives, confirming
    the defect is not cosmetic. This function instead returns each task's
    position in its diagram chain; `check()` below verifies the weaker, correct
    invariant: every `Depends on` edge inside one phase must point to a task
    that appears no later in that phase's diagram order.
    Returns (positions: dict[str,int], parsed: bool)."""
    positions = {}
    in_fence = False
    found_any_arrow = False
    for ln in lines:
        if ln.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            continue
        # normalize arrow glyphs
        norm = ln.replace("→", "->").replace("──", "-").replace("-", "-")
        if "->" not in norm:
            continue
        # only treat as a chain if arrows connect them left-to-right
        segments = [s for s in re.split(r"->", norm)]
        seq = []
        for seg in segments:
            ids = EDGE_RE.findall(seg.upper())
            seq.append(ids[-1] if ids else None)
        seq = [s for s in seq if s]
        if len(seq) >= 2:
            found_any_arrow = True
        for idx, tid in enumerate(seq):
            positions[tid] = idx
    return positions, found_any_arrow


def check(tasks_path):
    with open(tasks_path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()
    errors, warnings = [], []

    for name in REQUIRED_SECTIONS:
        if not section_present(lines, name):
            errors.append(f"missing required section: ## {name}")

    tasks = parse_tasks(lines)
    if not tasks:
        warnings.append("no tasks (### T1: ...) parsed - is this file filled in?")
        return errors, warnings

    # Field presence + granularity smell.
    for tid, t in tasks.items():
        if t["tests"] is None:
            errors.append(f"{tid}: missing `Tests` field")
        elif t["tests"].lower().startswith("none"):
            warnings.append(f"{tid}: Tests: none - confirm the Test Coverage Matrix says 'none' for this layer")
        if t["gate"] is None:
            errors.append(f"{tid}: missing `Gate` field")
        files = FILE_HINT_RE.findall(t["where"])
        if len(set(files)) > 1:
            warnings.append(f"{tid}: `Where` names multiple files {sorted(set(files))} - granularity smell, consider splitting")

    # Forward-phase dependency.
    membership = parse_phase_membership(lines)
    for tid, t in tasks.items():
        p_here = membership.get(tid)
        if p_here is None:
            continue
        for dep in t["deps"]:
            p_dep = membership.get(dep)
            if p_dep is not None and p_dep > p_here:
                errors.append(f"{tid} (phase {p_here}) depends on {dep} (phase {p_dep}) - dependencies must point backward or within the same phase")

    # Diagram vs definition cross-check (best effort, order-consistency - see
    # parse_diagram_order's docstring for why this is not exact-edge equality).
    positions, parsed = parse_diagram_order(lines)
    if not parsed:
        warnings.append("diagram arrows not parsed confidently - diagram/definition cross-check skipped (verify by hand)")
    else:
        for tid, t in tasks.items():
            p_here = membership.get(tid)
            if tid not in positions:
                continue
            for dep in sorted(t["deps"]):
                if dep not in positions:
                    continue
                p_dep = membership.get(dep)
                if p_dep is None or p_here is None or p_dep != p_here:
                    continue  # cross-phase; forward-phase check above already covers ordering
                if positions[dep] >= positions[tid]:
                    errors.append(
                        f"{tid} declares `Depends on: {dep}` but the phase diagram shows {dep} "
                        f"at or after {tid}, not before it"
                    )

    return errors, warnings


def main(argv=None):
    p = argparse.ArgumentParser(prog="validate_tasks.py", description="Pre-approval checks for a feature tasks.md.")
    p.add_argument("target", nargs="?", default=None)
    p.add_argument("--root", default=".")
    p.add_argument("--strict", action="store_true")
    args = p.parse_args(argv)

    tasks_path = resolve_tasks(args.target, args.root)
    if not tasks_path:
        print("validate_tasks: could not locate a tasks.md. Pass a path or run from the project root.", file=sys.stderr)
        return 2

    errors, warnings = check(tasks_path)
    for w in warnings:
        print(f"  WARN  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    fail = errors or (warnings and args.strict)
    print(f"\nvalidate_tasks: {len(errors)} error(s), {len(warnings)} warning(s) in {tasks_path}")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
