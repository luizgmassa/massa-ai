# Quick 010 — Summary

**Result**: Done. The flake was self-inflicted, not inherited: the test's own
subject (`getRuntimeSummary`) spawned 10 serial live `--version` probes, and
bun's timeout kill of the in-flight probe is the "dangling process" line. The
standing "earlier file leaks a child" diagnosis is overturned by the failed
attempt's log timeline plus a zero-hit spawn sweep of all 76 preceding
shared-batch files.

- Fix: `getRuntimeSummary(runtimes, deps?)` — `DetectDeps` seam threaded to
  `getVersion`; summary tests inject it and spawn nothing. Budget untouched.
- Red-first: deterministic repro via 1 s-sleep PATH stubs reproduced the exact
  CI signature; green under the same stubs after the seam.
- Batch proof: 77-file shared prefix under coverage shape → 1071 pass / 0 fail,
  zero dangling kills, exit 0. Core build + lint exit 0.
- CHANGELOG: `### Fixed` entry under `[Unreleased]` (patch bump).
