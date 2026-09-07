/**
 * Shared CLI formatter unit tests (T16 / TASK-016, BST-10, BST-11).
 *
 * Assertions here are line-shaped, not substring-shaped, wherever the spec
 * distinguishes two outcomes whose text is a prefix of the other's. `written`
 * is a substring of `written-not-wired`, so `expect(out).toContain("written")`
 * passes on a formatter that renders only the second — the exact failure
 * BST-10 AC-10a exists to prevent. Those cases split the output into lines and
 * assert on the whole line.
 *
 * The four-status coverage is driven by `BOOTSTRAP_RENDER_STATUSES` itself, so
 * a fifth status added without a formatter branch fails here rather than
 * rendering silently as whatever the fallthrough produces.
 */

import { describe, test, expect } from "bun:test";
import { formatBootstrapInventory, formatBootstrapReport } from "../format";
import { BOOTSTRAP_RULES, BOOTSTRAP_RULE_IDS, bootstrapRuleDefaults } from "../rules";
import { BOOTSTRAP_RENDER_STATUSES, buildBootstrapReport } from "../report";
import type { BootstrapRenderResult } from "../report";
import type { BootstrapState } from "../state";
import type { Host } from "../../profile-switch/hosts";

function state(overrides: Partial<Record<string, boolean>> = {}): BootstrapState {
  return { ...bootstrapRuleDefaults(), ...overrides } as BootstrapState;
}

function row(host: Host, status: BootstrapRenderResult["status"], reason?: string): BootstrapRenderResult {
  return reason === undefined ? { host, status } : { host, status, reason };
}

describe("formatBootstrapInventory — BST-11 AC-3", () => {
  test("names every one of the nine rule ids", () => {
    const lines = formatBootstrapInventory(state()).split("\n");
    for (const id of BOOTSTRAP_RULE_IDS) {
      expect(lines.some((line) => line.startsWith(`  ${id}: `))).toBe(true);
    }
  });

  test("prints one line per rule, in registry render order", () => {
    const lines = formatBootstrapInventory(state()).split("\n");
    expect(lines.map((line) => line.trim().split(":")[0])).toEqual([...BOOTSTRAP_RULE_IDS]);
  });

  test("carries each rule's one-line description verbatim", () => {
    const out = formatBootstrapInventory(state());
    for (const rule of BOOTSTRAP_RULES) {
      expect(out).toContain(rule.description);
    }
  });

  test("a rule whose default is enabled and whose state is off reads disabled with default: enabled", () => {
    const lines = formatBootstrapInventory(state({ "plan-challenge": false })).split("\n");
    const line = lines.find((l) => l.startsWith("  plan-challenge: "));
    expect(line).toBe(
      "  plan-challenge: disabled (default: enabled) — Run The Fool as a post-plan challenge gate per the configured policy.",
    );
  });

  test("code-comments switched on reads enabled while still naming its disabled default (BST-08 AC-2)", () => {
    const lines = formatBootstrapInventory(state({ "code-comments": true })).split("\n");
    const line = lines.find((l) => l.startsWith("  code-comments: "));
    expect(line).toContain("code-comments: enabled (default: disabled)");
  });

  test("the default is named on every row, including rows that agree with it", () => {
    const lines = formatBootstrapInventory(state()).split("\n");
    for (const rule of BOOTSTRAP_RULES) {
      const line = lines.find((l) => l.startsWith(`  ${rule.id}: `));
      expect(line).toContain(`(default: ${rule.defaultEnabled ? "enabled" : "disabled"})`);
    }
  });
});

describe("formatBootstrapReport — every status renders (PC-Q2, BST-10 AC-10)", () => {
  test("each of the four statuses prints its own literal on the host's line", () => {
    const hosts: Host[] = ["claude", "codex", "cursor", "opencode"];
    const rows = BOOTSTRAP_RENDER_STATUSES.map((status, i) =>
      row(hosts[i], status, status === "written" ? undefined : `${status} reason`),
    );
    const out = formatBootstrapReport(
      buildBootstrapReport({ rows, dryRun: false, ignoredStateKeys: [] }),
    );
    const lines = out.split("\n");
    expect(lines).toContain("  claude: written");
    expect(lines).toContain("  codex: written-not-wired: written-not-wired reason");
    expect(lines).toContain("  cursor: skipped: skipped reason");
    expect(lines).toContain("  opencode: failed: failed reason");
  });

  test("written-not-wired is never rendered as written (BST-10 AC-10a)", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({
        rows: [row("codex", "written-not-wired", "run scripts/install-skills.sh --apply")],
        dryRun: false,
        ignoredStateKeys: [],
      }),
    );
    const lines = out.split("\n");
    expect(lines).toContain("  codex: written-not-wired: run scripts/install-skills.sh --apply");
    expect(lines.some((line) => line.endsWith(": written"))).toBe(false);
  });

  test("skipped carries its reason, so a no-op is distinguishable from any other no-op", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({
        rows: [row("claude", "skipped", "already up to date")],
        dryRun: false,
        ignoredStateKeys: [],
      }),
    );
    expect(out.split("\n")).toContain("  claude: skipped: already up to date");
  });

  test("failed carries its reason", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({
        rows: [row("opencode", "failed", "opencode.jsonc is not parseable")],
        dryRun: false,
        ignoredStateKeys: [],
      }),
    );
    expect(out.split("\n")).toContain("  opencode: failed: opencode.jsonc is not parseable");
  });

  test("rows render in the order the engine emitted them", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({
        rows: [row("claude", "written"), row("codex", "written"), row("opencode", "written")],
        dryRun: false,
        ignoredStateKeys: [],
      }),
    );
    const hostLines = out.split("\n").filter((l) => l.startsWith("  "));
    expect(hostLines.map((l) => l.trim().split(":")[0])).toEqual(["claude", "codex", "opencode"]);
  });
});

describe("formatBootstrapReport — restart notice (BST-11 AC-5)", () => {
  test("a real run with a written row states that host sessions must restart", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({ rows: [row("claude", "written")], dryRun: false, ignoredStateKeys: [] }),
    );
    expect(out).toContain("A host session restart is required for the change to take effect.");
  });

  test("a dry run states no restart and marks itself as changing no files", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({ rows: [row("claude", "written")], dryRun: true, ignoredStateKeys: [] }),
    );
    expect(out).toContain("dry run — no files changed");
    expect(out).not.toContain("restart is required");
  });

  test("a pass whose only rows are skipped states no restart", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({
        rows: [row("claude", "skipped", "already up to date")],
        dryRun: false,
        ignoredStateKeys: [],
      }),
    );
    expect(out).not.toContain("restart is required");
  });
});

describe("formatBootstrapReport — no host installed (BST-11 AC-6)", () => {
  test("an empty report says no host is installed", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({ rows: [], dryRun: false, ignoredStateKeys: [] }),
    );
    expect(out.split("\n")).toContain("bootstrap: no host installed");
  });

  test("an empty report names no host and no status", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({ rows: [], dryRun: false, ignoredStateKeys: [] }),
    );
    for (const status of BOOTSTRAP_RENDER_STATUSES) {
      expect(out).not.toContain(`: ${status}`);
    }
  });
});

describe("formatBootstrapReport — ignored persisted state (BST-10 AC-12)", () => {
  test("an unregistered persisted id is reported, naming it", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({
        rows: [row("claude", "written")],
        dryRun: false,
        ignoredStateKeys: ["retired-rule"],
      }),
    );
    expect(out).toContain("Ignored persisted rule state: retired-rule");
  });

  test("every ignored key is named, not just the first", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({
        rows: [row("claude", "written")],
        dryRun: false,
        ignoredStateKeys: ["bootstrap.rules", "retired-rule"],
      }),
    );
    expect(out).toContain("Ignored persisted rule state: bootstrap.rules, retired-rule");
  });

  test("no ignored keys prints no ignored-state line at all", () => {
    const out = formatBootstrapReport(
      buildBootstrapReport({ rows: [row("claude", "written")], dryRun: false, ignoredStateKeys: [] }),
    );
    expect(out).not.toContain("Ignored persisted rule state");
  });
});
