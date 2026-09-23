# Validation — model-catalog-revamp

## Summary

**Result:** PASS. All 9 ACs match, and so do the carried agent-runtime-drift follow-ups (T1, T1b, T2). The independent verifier ran two iterations: the first blocked the drift follow-ups on T1b's source-order sensor, and the second verified everything at `417c9c6b`.

- Verifier: `massa-ai-verification-agent`, working in the scratch worktree `/tmp/wt-verify` (mutants restored from saved bytes).
- Discrimination sensor: 13 catalog and drift mutants (M9–M19). Iteration 1 killed 11, and M14/M14b survived (recorded state profile dropped from `--check` and from the real run). Both are killed at `417c9c6b`.

## Validation

| AC | Verdict | Evidence |
|---|---|---|
| AC1 tiers gone | PASS | 22 grep hits. Each is a v1 detection/rejection literal (`scripts/lib/model-profiles.ts:316`, `apps/tools-api/src/routes/model-registry.ts:71`), a test asserting absence, or a comment recording the removal. This matches the amended AC1 wording. |
| AC2 byte-identical generation | PASS | `diff -r` against the `/tmp/ac2-baseline` snapshot of `d73861cb`: only the 72 `model_tier` lines (18 × 4) and the judge/meta-judge Model Hint hunks differ (4 hosts × 3 trees) |
| AC3 catalog seeded | PASS | `scripts/__tests__/model-profiles.test.ts:115` |
| AC4 Models CRUD + persistence | PASS | `apps/web-ui/src/__tests__/registry-editor.test.ts:95`, `registry-editor.test.ts:110`; upgrade survival `scripts/__tests__/model-profiles.test.ts:527`; PUT round-trip `apps/tools-api/src/routes/model-registry-round-trip.test.ts:63` |
| AC5 dropdown grid | PASS | `apps/web-ui/src/__tests__/registry-editor.test.ts:153`, `registry-editor.test.ts:181` |
| AC6 per-agent overrides | PASS | `apps/web-ui/src/__tests__/registry-editor.test.ts:264`; override-first `scripts/__tests__/model-profiles.test.ts:359` |
| AC7 v1 overlay backup | PASS | `scripts/__tests__/model-profiles.test.ts:589`, `model-profiles.test.ts:603`; GET forwards the path `apps/tools-api/src/routes/model-registry.test.ts:203` |
| AC8 selection/switching | PASS | `scripts/__tests__/model-profiles.test.ts:183`; doctor `apps/mcp-client/src/__tests__/config-cli-doctor.test.ts:130` |
| AC9 gates | PASS | build/type-check/lint/`generate:artifacts --check` 0, `test:plugins` 150/0, web-ui 751/0; `CHANGELOG.md` Changed entries |
| Drift T1/T1b | PASS | `scripts/__tests__/generate-subagent-artifacts.test.ts:616`, `generate-subagent-artifacts.test.ts:643` |
| Drift T2 | PASS | `apps/mcp-client/src/__tests__/config-cli-doctor.test.ts:130` (+ host/targetHome call-arg tests) |

## Live evidence

The worktree API on :3399 served `GET /api/v1/model-registry` → v2, 22 models, 7 profiles, and 18 agents from the directory scan. Headless Chrome renders `/ui#/profiles` → Model Catalog with 3 sections: Models, Profiles and Per-Agent Model Overrides. The Add Model form shows the 1M-context checkbox for Claude.

## Skipped / environmental

- **Full local `bun run test`.** A Bun 1.3.14 SIGTRAP panic at child exit, also present on `main`, stops the isolation runner. CI on Linux is the full-suite gate.
- **Figma.** There is no design source; the design source was the user's request plus the spec.

## Review

The reviewer found 4 blocking issues (new-profile null leaves, effort-only unpin, doctor `--fix` host scope, `--check` state) and 9 advisories. They are fixed in `63afd5c0` and `16beaefb`. A pre-existing test-isolation hole and a stale-profile crash in the carried drift commit were root-caused and fixed in `fec25aa9`.
