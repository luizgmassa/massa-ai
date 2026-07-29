#!/usr/bin/env bun
/**
 * capture-facade-baseline — freeze PR-B's before-measurements as committed
 * fixtures.
 *
 * ## Why this exists
 *
 * Phase 0 recorded its before-baselines as unit tests that measure the **live
 * tree** (`describe("the real search directory at PR-B's base commit")`). That
 * works exactly until the refactor those baselines exist to police actually
 * starts: every Phase 1 task moves a delegate, and the pinned value moves with
 * it. `bun run test:scripts` therefore could not stay green through Phase 1,
 * and the plan's "725 pass / 0 fail" known-good was an invariant Phase 1
 * necessarily destroys. Updating the pins per task would turn a before-record
 * into an after-record that tracks whatever the refactor produces — which is
 * the one motion the plan forbids, and it would leave T17/T20 with no referent.
 *
 * This is the same fix T4 already applied to the needles baseline, for the same
 * reason: `needles-before.json` is committed because "a baseline that does not
 * survive a fresh checkout cannot be T17's referent."
 *
 * ## The guard on the guard
 *
 * A frozen baseline is only worth anything if silently re-freezing it is
 * detectable. Each fixture records the commit it was captured at, and the
 * suites assert that value against BASE_COMMIT. Regenerating mid-Phase-1 does
 * not quietly rebase the record — it turns the provenance test red.
 *
 * Usage:
 *   bun scripts/capture-facade-baseline.ts            # refuses off the base commit
 *   bun scripts/capture-facade-baseline.ts --force    # deliberate re-capture
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_FACADE, delegateScope, scan } from "./search-facade-matrix.ts";
import { measure, trackedFiles } from "./search-facade-metrics.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const OUT_DIR = join(REPO_ROOT, ".specs/features/core-layering-god-module-split");

/** PR-B's base commit — the tree every before-measurement describes. */
export const BASE_COMMIT = "d628464d6bd35d09897d91cda6fb342526fbe22b";

const SEARCH_DIR = join(REPO_ROOT, "packages/core/src/services/search");
const FACADE = "packages/core/src/services/search/contextual-search-rlm.ts";

/** The four FROZEN-ANCHOR needles (design.md §6.1). */
const FROZEN_NEEDLE_IDS = [
  "N03-keyword-boost-code-query",
  "N04-rrf-vector-blend",
  "N05-centrality-rerank-bonus",
  "N06-minscore-on-raw-vector",
];

function head(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

/**
 * Paths any of these measurements actually read. `.specs/`, `docs/` and
 * CHANGELOG are deliberately excluded: prose about the facade moves the
 * mention-only bucket, which no frozen figure depends on, and requiring a
 * byte-identical repository would make the capture impossible from the very
 * commit that documents it.
 */
const MEASURED_PATHS = ["packages", "apps", "scripts", "benchmarks"];

/**
 * This generator and the suites that read its output, excluded by name.
 *
 * `scripts/` stays in MEASURED_PATHS because a script *can* import the facade
 * and move fan-in — that is a real way to corrupt the capture, and dropping the
 * whole directory to make the tool run would be the T2 defect again (an
 * instrument blind to its own corpus). These four paths are excluded instead,
 * for a checkable reason: none imports the facade, so none can move fanIn,
 * fanOut, the matrix, or an anchor. They land in the mention-only bucket, which
 * design.md §7 and the D3 suite both treat as a floor, never a pin.
 */
const SELF_PATHS = [
  "scripts/capture-facade-baseline.ts",
  "scripts/__tests__/search-facade-matrix.test.ts",
  "scripts/__tests__/search-facade-metrics.test.ts",
  "scripts/__tests__/check-frozen-anchors.test.ts",
];

/**
 * The subject is at its base state when no measured path differs from the base
 * commit, in either the index or the working tree. Comparing HEAD's sha instead
 * would reject a docs-only commit that cannot move a single figure — and, worse,
 * would accept a source change carried in an uncommitted working tree.
 */
function subjectDivergence(): string[] {
  const committed = execFileSync(
    "git",
    ["diff", "--name-only", BASE_COMMIT, "HEAD", "--", ...MEASURED_PATHS],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  const uncommitted = execFileSync(
    "git",
    ["status", "--porcelain", "--", ...MEASURED_PATHS],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  return [
    ...committed.split("\n").filter(Boolean),
    ...uncommitted.split("\n").filter(Boolean).map((l) => l.slice(3)),
  ].filter((p) => !SELF_PATHS.includes(p));
}

function write(name: string, body: unknown): void {
  const path = join(OUT_DIR, name);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`  wrote ${name}`);
}

function main(): void {
  const force = process.argv.includes("--force");
  const at = head();
  const diverged = subjectDivergence();
  if (diverged.length > 0 && !force) {
    console.error(
      `refusing to capture: ${diverged.length} measured path(s) differ from PR-B's base ${BASE_COMMIT.slice(0, 7)}:\n` +
        diverged.slice(0, 10).map((p) => `  ${p}`).join("\n") +
        (diverged.length > 10 ? `\n  … and ${diverged.length - 10} more` : "") +
        `\nA baseline captured over a changed subject is an after-record wearing a before-record's name.\n` +
        `Pass --force only if you mean to move the referent, and expect the provenance tests to go red.`,
    );
    process.exit(2);
  }

  // `capturedAt` is informational: a docs-only commit has a different sha and
  // an identical subject, so sha equality is the wrong question — it is exactly
  // the conflation the divergence check above exists to avoid. `subjectAtBase`
  // is the load-bearing field. It is false only under --force over a changed
  // subject, which is the one case that silently moves the referent, and the
  // suites assert it.
  const provenance = {
    baseCommit: BASE_COMMIT,
    capturedAt: at,
    subjectAtBase: diverged.length === 0,
    generatedBy: "scripts/capture-facade-baseline.ts",
    note: "Frozen before-record for PR-B. Do not regenerate during Phase 1 — see the header of the generator.",
  };

  console.log(`capturing PR-B before-baselines at ${at.slice(0, 7)}`);

  // D1 — the member→consumer matrix, exactly the value the suite computed.
  write("facade-matrix-before.json", {
    ...provenance,
    searchDir: "packages/core/src/services/search",
    facade: DEFAULT_FACADE,
    delegateScope: delegateScope(scan(SEARCH_DIR, DEFAULT_FACADE)),
  });

  // D3 — fan-in / fan-out of the facade module (design.md §7).
  const m = measure(FACADE, trackedFiles());
  write("facade-metrics-before.json", {
    ...provenance,
    subject: FACADE,
    fanInStatic: m.fanInStatic,
    fanInDynamic: m.fanInDynamic,
    fanOut: m.fanOut,
  });

  // FROZEN-ANCHOR — the four anchor *strings*. The path is provenance only:
  // moving an anchor between files is explicitly legal (resolution is by
  // content), so pinning the path tests something the constraint does not say.
  const fixture = JSON.parse(
    readFileSync(join(REPO_ROOT, "benchmarks/needles/fixtures/massa-ai.json"), "utf8"),
  ) as { needles: { id: string; expected: { anchor: string } }[] };
  const anchorReport = JSON.parse(
    execFileSync("bun", ["scripts/check-frozen-anchors.ts", "--json"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  ) as { reports: { needleId: string; filePath?: string }[] };

  write("frozen-anchors-before.json", {
    ...provenance,
    anchors: FROZEN_NEEDLE_IDS.map((id) => {
      const needle = fixture.needles.find((n) => n.id === id);
      if (!needle) throw new Error(`needle ${id} missing from the fixture`);
      return {
        needleId: id,
        anchor: needle.expected.anchor,
        filePathAtBase: anchorReport.reports.find((r) => r.needleId === id)?.filePath,
      };
    }),
  });
}

if (import.meta.main) main();
