/**
 * Bootstrap report unit tests (T7 / TASK-007, BST-10, BST-11).
 *
 * Assertions here are set-shaped and per-status, never count-shaped, for the
 * reason `rules.test.ts:4-8` states: `expect(statuses).toHaveLength(4)` still
 * passes when one union member is swapped for another, and the whole point of
 * `written-not-wired` is that it must not be interchangeable with `written`.
 *
 * The two verdict tables below are driven by `BOOTSTRAP_RENDER_STATUSES`
 * itself, so adding a fifth status without deciding its exit-code and
 * restart semantics fails on the missing table row rather than silently
 * inheriting a default.
 */

import { describe, test, expect } from "bun:test";
import {
  BOOTSTRAP_RENDER_STATUSES,
  type BootstrapRenderResult,
  type BootstrapRenderStatus,
  bootstrapReportSucceeded,
  buildBootstrapReport,
} from "../report";
import { HOSTS, type Host } from "../../profile-switch/hosts";

const EXPECTED_STATUSES: readonly string[] = [
  "written",
  "written-not-wired",
  "skipped",
  "failed",
];

function row(host: Host, status: BootstrapRenderStatus, reason?: string): BootstrapRenderResult {
  return reason === undefined ? { host, status } : { host, status, reason };
}

describe("BOOTSTRAP_RENDER_STATUSES — the union is exactly four members", () => {
  test("is exactly the four design statuses, as a set", () => {
    expect(new Set(BOOTSTRAP_RENDER_STATUSES)).toEqual(new Set(EXPECTED_STATUSES));
  });

  test("has no duplicate members", () => {
    expect(new Set(BOOTSTRAP_RENDER_STATUSES).size).toBe(BOOTSTRAP_RENDER_STATUSES.length);
  });

  test("written-not-wired is a member distinct from written", () => {
    expect(BOOTSTRAP_RENDER_STATUSES).toContain("written-not-wired");
    expect(BOOTSTRAP_RENDER_STATUSES).toContain("written");
    // Named explicitly because the whole status exists to not be `written`
    // (BST-10 AC-10a): a host recorded by a plugin install has a state entry
    // and has never had wiring.
    expect("written-not-wired").not.toBe("written");
  });
});

describe("bootstrapReportSucceeded — per-status exit verdict", () => {
  // One row per union member, so a flipped verdict or a new member reddens.
  const cleanByStatus: Record<BootstrapRenderStatus, boolean> = {
    written: true,
    "written-not-wired": false,
    skipped: true,
    failed: false,
  };

  test("every union member has a decided verdict", () => {
    expect(new Set(Object.keys(cleanByStatus))).toEqual(new Set(BOOTSTRAP_RENDER_STATUSES));
  });

  for (const status of BOOTSTRAP_RENDER_STATUSES) {
    test(`a lone "${status}" row makes the report ${cleanByStatus[status] ? "succeed" : "fail"}`, () => {
      const report = buildBootstrapReport({
        rows: [row("claude", status)],
        dryRun: false,
        ignoredStateKeys: [],
      });
      expect(bootstrapReportSucceeded(report)).toBe(cleanByStatus[status]);
    });
  }

  test("written-not-wired beside three clean rows still fails the report", () => {
    // The load-bearing case: collapsing this status into `written` would exit
    // 0 for a host that cannot load the file it was just handed.
    const report = buildBootstrapReport({
      rows: [
        row("claude", "written"),
        row("codex", "written"),
        row("cursor", "written-not-wired", "run scripts/install-skills.sh --apply"),
        row("opencode", "skipped", "not installed"),
      ],
      dryRun: false,
      ignoredStateKeys: [],
    });
    expect(bootstrapReportSucceeded(report)).toBe(false);
  });

  test("all-clean rows across every host succeed", () => {
    const report = buildBootstrapReport({
      rows: HOSTS.map((host) => row(host, "written")),
      dryRun: false,
      ignoredStateKeys: [],
    });
    expect(bootstrapReportSucceeded(report)).toBe(true);
  });

  test("an empty report succeeds — no host recorded is exit 0 (BST-11 AC-6)", () => {
    const report = buildBootstrapReport({ rows: [], dryRun: false, ignoredStateKeys: [] });
    expect(bootstrapReportSucceeded(report)).toBe(true);
  });

  test("ignoredStateKeys never fails the report (BST-10 AC-12)", () => {
    const report = buildBootstrapReport({
      rows: [row("claude", "written")],
      dryRun: false,
      ignoredStateKeys: ["retired-rule", "typo-rule"],
    });
    expect(bootstrapReportSucceeded(report)).toBe(true);
    expect(report.ignoredStateKeys).toEqual(["retired-rule", "typo-rule"]);
  });
});

describe("restartRequired — true only for a non-dry-run with a written row", () => {
  test("a real run with one written row requires a restart", () => {
    const report = buildBootstrapReport({
      rows: [row("claude", "written"), row("codex", "skipped", "not installed")],
      dryRun: false,
      ignoredStateKeys: [],
    });
    expect(report.restartRequired).toBe(true);
  });

  test("negative 1 — a dry run with written rows requires no restart", () => {
    const report = buildBootstrapReport({
      rows: HOSTS.map((host) => row(host, "written")),
      dryRun: true,
      ignoredStateKeys: [],
    });
    expect(report.restartRequired).toBe(false);
    expect(report.dryRun).toBe(true);
  });

  test("negative 2 — a real run with no written row requires no restart", () => {
    const report = buildBootstrapReport({
      rows: [row("claude", "skipped", "not installed"), row("codex", "failed", "unreadable")],
      dryRun: false,
      ignoredStateKeys: [],
    });
    expect(report.restartRequired).toBe(false);
  });

  test("negative 3 — an empty real run requires no restart", () => {
    const report = buildBootstrapReport({ rows: [], dryRun: false, ignoredStateKeys: [] });
    expect(report.restartRequired).toBe(false);
  });

  // Per-status contribution table. `written-not-wired` is false by decision,
  // documented at `report.ts`'s `buildBootstrapReport`: that host has no
  // artifact loading the contract, so a restart picks up nothing — the remedy
  // is `scripts/install-skills.sh --apply`, which reports its own restart.
  const restartByStatus: Record<BootstrapRenderStatus, boolean> = {
    written: true,
    "written-not-wired": false,
    skipped: false,
    failed: false,
  };

  test("every union member has a decided restart contribution", () => {
    expect(new Set(Object.keys(restartByStatus))).toEqual(new Set(BOOTSTRAP_RENDER_STATUSES));
  });

  for (const status of BOOTSTRAP_RENDER_STATUSES) {
    test(`a real run whose only row is "${status}" sets restartRequired ${restartByStatus[status]}`, () => {
      const report = buildBootstrapReport({
        rows: [row("claude", status)],
        dryRun: false,
        ignoredStateKeys: [],
      });
      expect(report.restartRequired).toBe(restartByStatus[status]);
    });

    test(`a dry run whose only row is "${status}" never sets restartRequired`, () => {
      const report = buildBootstrapReport({
        rows: [row("claude", status)],
        dryRun: true,
        ignoredStateKeys: [],
      });
      expect(report.restartRequired).toBe(false);
    });
  }
});

describe("BootstrapReport — the four design.md fields", () => {
  test("carries exactly rows, restartRequired, dryRun and ignoredStateKeys", () => {
    const report = buildBootstrapReport({
      rows: [row("claude", "written")],
      dryRun: false,
      ignoredStateKeys: ["retired-rule"],
    });
    expect(new Set(Object.keys(report))).toEqual(
      new Set(["rows", "restartRequired", "dryRun", "ignoredStateKeys"]),
    );
  });

  test("passes rows through in the caller's order, unmodified", () => {
    // Row order is the engine's determinism guarantee (T8: registry host
    // order); this module must not reorder or filter.
    const rows = [
      row("claude", "written"),
      row("codex", "written-not-wired", "run scripts/install-skills.sh --apply"),
      row("cursor", "skipped", "not installed"),
      row("opencode", "failed", "config.json unreadable"),
    ];
    const report = buildBootstrapReport({ rows, dryRun: false, ignoredStateKeys: [] });
    expect(report.rows).toEqual(rows);
    expect(report.rows.map((r) => r.host)).toEqual(["claude", "codex", "cursor", "opencode"]);
  });

  test("a row's reason survives onto the report", () => {
    const report = buildBootstrapReport({
      rows: [row("cursor", "written-not-wired", "run scripts/install-skills.sh --apply")],
      dryRun: false,
      ignoredStateKeys: [],
    });
    expect(report.rows[0]?.reason).toBe("run scripts/install-skills.sh --apply");
  });

  test("dryRun is carried through in both directions", () => {
    const rows = [row("claude", "written")];
    expect(buildBootstrapReport({ rows, dryRun: true, ignoredStateKeys: [] }).dryRun).toBe(true);
    expect(buildBootstrapReport({ rows, dryRun: false, ignoredStateKeys: [] }).dryRun).toBe(false);
  });
});
