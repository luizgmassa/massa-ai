/**
 * Bootstrap apply engine unit tests (T8 / TASK-008, BST-10, BST-11).
 *
 * This is the first suite in `src/bootstrap/` whose subject touches the
 * filesystem, and it deliberately installs **no** `spyOn(fs, ...)` harness —
 * unlike `state.test.ts`, which needs one because `config-loader.ts` freezes
 * `CONFIG_FILE` to the real XDG path at module-eval time. The engine resolves
 * every path from `targetHome`, so a real scratch directory under
 * `os.tmpdir()` is both sufficient and stricter: `packages/shared` runs one
 * plain `bun test` process over every file, so a leaked fs spy contaminates
 * sibling suites, while a scratch directory cannot. It is also the only
 * harness that can prove the dry-run and degrade claims — a mocked `fs` proves
 * the engine did not call a stub, not that nothing was written.
 *
 * The highest-value assertion in the file is `targetHome` threading. An engine
 * that resolved the real home internally would pass every status assertion
 * below while writing the developer's own `~/.claude/MASSA-AI.md` on every
 * run, so two tests pin it from both directions: state recorded under the
 * scratch home is read, and an empty scratch home yields no rows regardless of
 * what the real home has installed.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import { HOSTS, type Host } from "../../profile-switch/hosts";
import { applyBootstrapState, BootstrapEngineError } from "../engine";
import {
  BOOTSTRAP_BLOCK_END,
  BOOTSTRAP_BLOCK_START,
  bootstrapContractPath,
  bootstrapStateFilePath,
  ruleMarker,
} from "../render";
import { bootstrapReportSucceeded, type BootstrapRenderResult } from "../report";
import { BOOTSTRAP_RULES, type BootstrapRuleId } from "../rules";

// ---------------------------------------------------------------------------
// Scratch home
// ---------------------------------------------------------------------------

let home = "";

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-bootstrap-engine-"));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function installStatePath(): string {
  return path.join(home, ".config", "massa-ai", "install-state.json");
}

/** Record `hosts` as installed, in the shape `install-state.json` v2 uses. */
function seedInstallState(hosts: readonly Host[]): void {
  const platforms: Record<string, unknown> = {};
  for (const host of hosts) {
    platforms[host] = {
      root: path.join(home, `.${host}`),
      skills: ["massa-ai"],
      skillsOwner: "repo",
    };
  }
  write(installStatePath(), `${JSON.stringify({ version: 2, platforms }, null, 2)}\n`);
}

/** Seed `config.json` with exact bytes, so a malformed document survives. */
function seedRuleStateRaw(text: string): void {
  write(bootstrapStateFilePath(home), text);
}

function seedRuleState(rules: Partial<Record<BootstrapRuleId, boolean>>): void {
  seedRuleStateRaw(`${JSON.stringify({ bootstrap: { rules } }, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Wiring artifacts
// ---------------------------------------------------------------------------

/**
 * Write the artifact that makes `host` load its contract, in the exact shape
 * design.md:204-209 delivers and `engine.ts`'s `wiringArtifact` probes: a
 * relative `@MASSA-AI.md` import for Claude (its imports resolve against the
 * containing file), the absolute contract path inside the rendered pointer
 * block for Codex and Cursor, and the same absolute path as an `instructions`
 * member for OpenCode.
 */
function seedWiring(host: Host): void {
  const contractPath = bootstrapContractPath(host, home);
  switch (host) {
    case "claude":
      write(
        path.join(home, ".claude", "CLAUDE.md"),
        "# My own notes\n\n<!-- massa-ai:bootstrap:start -->\n@MASSA-AI.md\n<!-- massa-ai:bootstrap:end -->\n",
      );
      return;
    case "codex":
    case "cursor":
      write(
        path.join(home, `.${host}`, "AGENTS.md"),
        `## massa-ai Startup Contract\n\nBefore substantive work in this session, read\n\`${contractPath}\`\nwith your Read tool and follow it.\n`,
      );
      return;
    case "opencode":
      write(
        path.join(home, ".config", "opencode", "opencode.jsonc"),
        `${JSON.stringify({ instructions: [contractPath] }, null, 2)}\n`,
      );
      return;
  }
}

function seedAllWiring(hosts: readonly Host[] = HOSTS): void {
  for (const host of hosts) seedWiring(host);
}

// ---------------------------------------------------------------------------
// Source fixture
// ---------------------------------------------------------------------------

/** `packages/shared/src/bootstrap/__tests__` → repository root. */
const REPO_ROOT = path.resolve(import.meta.dir, "../../../../..");
const REAL_SOURCE_PATH = path.join(REPO_ROOT, "skills", "AGENTS.md");

/** A per-rule token that appears nowhere else, so a rule's presence in the
 *  rendered contract is a substring test rather than a phrase match. */
function ruleToken(id: BootstrapRuleId): string {
  return `RULE-BODY-${id.toUpperCase()}`;
}

/**
 * A source carrying one well-formed span per registry rule. Built from
 * `BOOTSTRAP_RULES` rather than hardcoded, so adding a rule cannot leave this
 * suite rendering a source the registry no longer matches.
 */
function syntheticSource(): string {
  const out: string[] = [BOOTSTRAP_BLOCK_START, "# Intro", "", "Intro paragraph.", ""];
  for (const rule of BOOTSTRAP_RULES) {
    out.push(
      ruleMarker(rule.id, "start"),
      `## Section ${rule.id}`,
      "",
      ruleToken(rule.id),
      ruleMarker(rule.id, "end"),
      "",
    );
  }
  out.push(BOOTSTRAP_BLOCK_END, "");
  return out.join("\n");
}

const SOURCE = syntheticSource();

function apply(overrides: Record<string, unknown> = {}) {
  return applyBootstrapState({ targetHome: home, source: SOURCE, ...overrides });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusByHost(rows: readonly BootstrapRenderResult[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.host, row.status]));
}

function reasonFor(rows: readonly BootstrapRenderResult[], host: Host): string {
  return rows.find((row) => row.host === host)?.reason ?? "";
}

/**
 * A content fingerprint of the whole scratch home: every relative path paired
 * with the SHA-256 of its bytes, sorted.
 *
 * Path-and-content rather than a flag: the dry-run claim is "wrote nothing",
 * and only a comparison of the tree before and after can falsify it. A
 * `dryRun` field asserted against itself would pass for an engine that wrote
 * every file and then set the flag.
 */
function fingerprint(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(`${path.relative(root, full)}/`);
        walk(full);
        continue;
      }
      const hash = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
      out.push(`${path.relative(root, full)} ${hash}`);
    }
  };
  walk(root);
  return out;
}

// ---------------------------------------------------------------------------
// AC-1 — targetHome is threaded to both paths (design.md:342-349)
// ---------------------------------------------------------------------------

describe("targetHome threading", () => {
  test("hosts come from install-state.json under targetHome", () => {
    seedInstallState(["codex", "opencode"]);
    seedAllWiring();

    const report = apply();

    expect(report.rows.map((row) => row.host)).toEqual(["codex", "opencode"]);
  });

  test("an empty scratch home yields no rows, whatever the real home has installed", () => {
    // The developer's real ~/.config/massa-ai/install-state.json normally
    // records every host they use. An engine that resolved the real home — or
    // reached getConfigPath(), which is frozen to it (config-loader.ts:8-9) —
    // would produce rows here, and would go on to write the real
    // ~/.claude/MASSA-AI.md. This is the assertion that makes that
    // indistinguishable from a bug rather than from a green run.
    const report = apply();

    expect(report.rows).toEqual([]);
    expect(fs.existsSync(installStatePath())).toBe(false);
  });

  test("rule state comes from config.json under targetHome", () => {
    seedInstallState(["codex"]);
    seedAllWiring();
    seedRuleState({ "plan-challenge": false });

    apply();

    const contract = fs.readFileSync(bootstrapContractPath("codex", home), "utf-8");
    expect(contract).not.toContain(ruleToken("plan-challenge"));
    // A sibling rule proves the omission is the persisted preference and not a
    // render that dropped everything.
    expect(contract).toContain(ruleToken("caveman"));
  });

  test("writes land only under targetHome", () => {
    seedInstallState([...HOSTS]);
    seedAllWiring();

    apply();

    const written = fingerprint(home).filter((entry) => entry.includes("MASSA-AI.md"));
    expect(new Set(written.map((entry) => entry.split(" ")[0]))).toEqual(
      new Set(HOSTS.map((host) => path.relative(home, bootstrapContractPath(host, home)))),
    );
  });

  test("a relative targetHome is refused before any file is touched", () => {
    expect(() => applyBootstrapState({ targetHome: "relative/home", source: SOURCE })).toThrow(
      /targetHome must be an absolute path/,
    );
  });
});

// ---------------------------------------------------------------------------
// AC-2 — the wiring probe (BST-10 AC-10a)
// ---------------------------------------------------------------------------

describe("wiring probe (BST-10 AC-10a)", () => {
  for (const host of HOSTS) {
    test(`${host}: wiring present → written`, () => {
      seedInstallState([host]);
      seedWiring(host);

      const report = apply();

      expect(statusByHost(report.rows)).toEqual({ [host]: "written" });
      expect(fs.existsSync(bootstrapContractPath(host, home))).toBe(true);
    });

    test(`${host}: wiring absent → written-not-wired naming the remedy`, () => {
      seedInstallState([host]);

      const report = apply();

      expect(statusByHost(report.rows)).toEqual({ [host]: "written-not-wired" });
      expect(reasonFor(report.rows, host)).toContain("scripts/install-skills.sh --apply");
      // The file is still written — the status says the file exists and
      // nothing loads it, not that the write was skipped.
      expect(fs.existsSync(bootstrapContractPath(host, home))).toBe(true);
    });
  }

  test("the reason names the artifact this host is missing", () => {
    seedInstallState([...HOSTS]);

    const rows = apply().rows;

    expect(reasonFor(rows, "claude")).toContain("@MASSA-AI.md");
    expect(reasonFor(rows, "claude")).toContain(path.join(home, ".claude", "CLAUDE.md"));
    expect(reasonFor(rows, "codex")).toContain(path.join(home, ".codex", "AGENTS.md"));
    expect(reasonFor(rows, "cursor")).toContain(path.join(home, ".cursor", "AGENTS.md"));
    expect(reasonFor(rows, "opencode")).toContain(
      path.join(home, ".config", "opencode", "opencode.jsonc"),
    );
  });

  test("a pointer naming another home's contract is not wiring", () => {
    seedInstallState(["cursor"]);
    write(
      path.join(home, ".cursor", "AGENTS.md"),
      "## massa-ai Startup Contract\n\nread `/some/other/home/.cursor/MASSA-AI.md`\n",
    );

    expect(statusByHost(apply().rows)).toEqual({ cursor: "written-not-wired" });
  });

  test("claude's probe accepts the relative import its own loader resolves", () => {
    // Claude's `@` import resolves relative to the containing file, so the
    // wiring never carries an absolute path. A probe that demanded one would
    // report written-not-wired for every correctly wired Claude install.
    seedInstallState(["claude"]);
    write(path.join(home, ".claude", "CLAUDE.md"), "@MASSA-AI.md\n");

    expect(statusByHost(apply().rows)).toEqual({ claude: "written" });
  });

  test("opencode: an entry in opencode.json is wiring", () => {
    seedInstallState(["opencode"]);
    write(
      path.join(home, ".config", "opencode", "opencode.json"),
      JSON.stringify({ instructions: [bootstrapContractPath("opencode", home)] }),
    );

    expect(statusByHost(apply().rows)).toEqual({ opencode: "written" });
  });

  test("opencode: opencode.json wins over opencode.jsonc, as OpenCode merges it", () => {
    // resolveConfigPath (scripts/lib/opencode-config.cjs:26-44) returns the
    // .json path when both exist, because OpenCode core merges opencode.json
    // over opencode.jsonc. A probe that accepted either file would report
    // `written` for a config whose winning document has no entry.
    seedInstallState(["opencode"]);
    seedWiring("opencode");
    write(
      path.join(home, ".config", "opencode", "opencode.json"),
      JSON.stringify({ instructions: ["/somewhere/else.md"] }),
    );

    expect(statusByHost(apply().rows)).toEqual({ opencode: "written-not-wired" });
  });
});

// ---------------------------------------------------------------------------
// AC-3 — no host recorded (BST-11 AC-6)
// ---------------------------------------------------------------------------

describe("no host recorded (BST-11 AC-6)", () => {
  test("an absent install-state.json gives an empty, successful report", () => {
    const report = apply();

    expect(report.rows).toEqual([]);
    expect(bootstrapReportSucceeded(report)).toBe(true);
    expect(report.restartRequired).toBe(false);
  });

  test("an install-state.json recording no platform gives an empty report", () => {
    seedInstallState([]);

    expect(apply().rows).toEqual([]);
  });

  test("no MASSA-AI.md is written for any host", () => {
    seedInstallState([]);

    apply();

    expect(fingerprint(home).filter((entry) => entry.includes("MASSA-AI.md"))).toEqual([]);
  });

  test("a source is not required to learn that no host is installed", () => {
    // Ordering, not tolerance: BST-11 AC-6 is an exit-0 outcome, so a caller
    // with nothing to render must not have to supply a source to find out.
    expect(applyBootstrapState({ targetHome: home }).rows).toEqual([]);
  });

  test("a recorded host with no source is a named refusal, not a silent default", () => {
    seedInstallState(["codex"]);

    expect(() => applyBootstrapState({ targetHome: home })).toThrow(BootstrapEngineError);
    try {
      applyBootstrapState({ targetHome: home });
    } catch (error) {
      expect((error as BootstrapEngineError).name).toBe("BootstrapSourceUnavailableError");
    }
  });
});

// ---------------------------------------------------------------------------
// AC-4 — a dry run writes nothing
// ---------------------------------------------------------------------------

describe("dryRun writes nothing", () => {
  test("the scratch home is byte-identical before and after", () => {
    seedInstallState([...HOSTS]);
    seedAllWiring();
    seedRuleState({ "plan-challenge": false });

    const before = fingerprint(home);
    const report = apply({ dryRun: true });
    const after = fingerprint(home);

    expect(after).toEqual(before);
    expect(report.dryRun).toBe(true);
  });

  test("a dry run still reports the status each host would get", () => {
    seedInstallState(["codex", "cursor"]);
    seedWiring("codex");

    const report = apply({ dryRun: true });

    expect(statusByHost(report.rows)).toEqual({
      codex: "written",
      cursor: "written-not-wired",
    });
  });

  test("a dry run never requires a restart, even with written rows", () => {
    // Delegated to buildBootstrapReport (report.ts:127) rather than derived
    // here, so the engine cannot restate the invariant differently.
    seedInstallState(["codex"]);
    seedWiring("codex");

    expect(apply({ dryRun: true }).restartRequired).toBe(false);
    expect(apply().restartRequired).toBe(true);
  });

  test("a dry run leaves an existing contract untouched", () => {
    seedInstallState(["codex"]);
    seedWiring("codex");
    write(bootstrapContractPath("codex", home), "stale contents\n");

    apply({ dryRun: true });

    expect(fs.readFileSync(bootstrapContractPath("codex", home), "utf-8")).toBe("stale contents\n");
  });
});

// ---------------------------------------------------------------------------
// AC-5 — deterministic row order
// ---------------------------------------------------------------------------

describe("row order", () => {
  test("rows follow registry host order, not install-state key order", () => {
    const reversed = [...HOSTS].reverse();
    seedInstallState(reversed);
    seedAllWiring();

    expect(apply().rows.map((row) => row.host)).toEqual([...HOSTS]);
  });

  test("a subset keeps registry order", () => {
    seedInstallState(["opencode", "claude"]);
    seedAllWiring();

    expect(apply().rows.map((row) => row.host)).toEqual(["claude", "opencode"]);
  });

  test("two runs over one state produce identical rows", () => {
    seedInstallState([...HOSTS]);
    seedAllWiring();

    expect(apply({ dryRun: true }).rows).toEqual(apply({ dryRun: true }).rows);
  });

  test("an unknown platform key is not a row", () => {
    write(
      installStatePath(),
      JSON.stringify({ version: 2, platforms: { windsurf: { root: "/x", skills: [] } } }),
    );

    expect(apply().rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC-6 — unreadable rule state degrades to defaults (BST-10 AC-10b)
// ---------------------------------------------------------------------------

describe("unreadable rule state (BST-10 AC-10b)", () => {
  test("renders the registry defaults", () => {
    seedInstallState(["codex"]);
    seedAllWiring();
    seedRuleStateRaw("{ this is not json");

    apply({ onWarning: () => {} });

    const contract = fs.readFileSync(bootstrapContractPath("codex", home), "utf-8");
    for (const rule of BOOTSTRAP_RULES) {
      expect({ id: rule.id, present: contract.includes(ruleToken(rule.id)) }).toEqual({
        id: rule.id,
        present: rule.defaultEnabled,
      });
    }
  });

  test("emits a named warning identifying the file and the parse failure", () => {
    seedInstallState(["codex"]);
    seedRuleStateRaw("{ this is not json");

    const warnings: string[] = [];
    apply({ onWarning: (message: string) => warnings.push(message) });

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("ConfigParseError");
    expect(warnings[0]).toContain(bootstrapStateFilePath(home));
    expect(warnings[0]).toContain("JSON");
  });

  test("config.json is not written", () => {
    seedInstallState([...HOSTS]);
    const malformed = "{ this is not json";
    seedRuleStateRaw(malformed);

    apply({ onWarning: () => {} });

    expect(fs.readFileSync(bootstrapStateFilePath(home), "utf-8")).toBe(malformed);
  });

  test("a valid document that is not a JSON object degrades the same way", () => {
    seedInstallState(["codex"]);
    seedRuleStateRaw("[1, 2, 3]\n");

    const warnings: string[] = [];
    apply({ onWarning: (message: string) => warnings.push(message) });

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("not a JSON object");
  });

  test("an absent config.json is not a degrade and warns nothing", () => {
    seedInstallState(["codex"]);
    seedAllWiring();

    const warnings: string[] = [];
    apply({ onWarning: (message: string) => warnings.push(message) });

    expect(warnings).toEqual([]);
  });

  test("a readable config.json warns nothing and is not written", () => {
    seedInstallState(["codex"]);
    seedAllWiring();
    seedRuleState({ "plan-challenge": false });
    const before = fs.readFileSync(bootstrapStateFilePath(home), "utf-8");

    const warnings: string[] = [];
    apply({ onWarning: (message: string) => warnings.push(message) });

    expect(warnings).toEqual([]);
    expect(fs.readFileSync(bootstrapStateFilePath(home), "utf-8")).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Rule state, statuses and the source seam
// ---------------------------------------------------------------------------

describe("rule state", () => {
  test("an unregistered persisted id is reported, never fatal (BST-10 AC-12)", () => {
    seedInstallState(["codex"]);
    seedAllWiring();
    seedRuleStateRaw(
      `${JSON.stringify({ bootstrap: { rules: { "no-such-rule": false } } }, null, 2)}\n`,
    );

    const report = apply();

    expect(report.ignoredStateKeys).toEqual(["no-such-rule"]);
    expect(statusByHost(report.rows)).toEqual({ codex: "written" });
    expect(bootstrapReportSucceeded(report)).toBe(true);
  });

  test("a re-apply over an identical contract is skipped, not written", () => {
    seedInstallState(["codex"]);
    seedWiring("codex");

    const first = apply();
    const second = apply();

    expect(statusByHost(first.rows)).toEqual({ codex: "written" });
    expect(statusByHost(second.rows)).toEqual({ codex: "skipped" });
    expect(second.restartRequired).toBe(false);
  });

  test("an unwired host stays written-not-wired across a re-apply", () => {
    seedInstallState(["codex"]);

    apply();

    expect(statusByHost(apply().rows)).toEqual({ codex: "written-not-wired" });
  });

  test("a toggle change rewrites a host whose contract is stale", () => {
    seedInstallState(["codex"]);
    seedWiring("codex");
    apply();

    seedRuleState({ caveman: false });
    const report = apply();

    expect(statusByHost(report.rows)).toEqual({ codex: "written" });
    expect(fs.readFileSync(bootstrapContractPath("codex", home), "utf-8")).not.toContain(
      ruleToken("caveman"),
    );
  });
});

describe("failures", () => {
  test("a source with no bootstrap block fails every host rather than throwing", () => {
    seedInstallState(["codex", "cursor"]);

    const report = apply({ source: "# no markers here\n" });

    expect(statusByHost(report.rows)).toEqual({ codex: "failed", cursor: "failed" });
    expect(reasonFor(report.rows, "codex")).toContain("bootstrap block");
    expect(bootstrapReportSucceeded(report)).toBe(false);
    expect(report.restartRequired).toBe(false);
  });

  test("an unreadable sourcePath is a named refusal", () => {
    seedInstallState(["codex"]);
    const missing = path.join(home, "nope", "AGENTS.md");

    try {
      applyBootstrapState({ targetHome: home, sourcePath: missing });
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as BootstrapEngineError).name).toBe("BootstrapSourceUnreadableError");
      expect((error as Error).message).toContain(missing);
    }
  });

  test("a corrupt install-state.json is a run-level failure, not a host row", () => {
    write(installStatePath(), "{ not json");

    expect(() => apply()).toThrow(/install-state\.json/);
  });
});

describe("source seam", () => {
  test("sourcePath renders the same contract as the equivalent source text", () => {
    seedInstallState(["codex"]);
    seedWiring("codex");
    const sourceFile = path.join(home, "AGENTS-source.md");
    write(sourceFile, SOURCE);

    applyBootstrapState({ targetHome: home, sourcePath: sourceFile });
    const viaPath = fs.readFileSync(bootstrapContractPath("codex", home), "utf-8");
    fs.rmSync(bootstrapContractPath("codex", home));
    apply();

    expect(fs.readFileSync(bootstrapContractPath("codex", home), "utf-8")).toBe(viaPath);
  });

  test("the real skills/AGENTS.md renders end to end", () => {
    // The synthetic source above proves the state plumbing; this proves the
    // engine is compatible with the source the installer actually reads
    // (scripts/install-skills.sh:213).
    expect(fs.existsSync(REAL_SOURCE_PATH)).toBe(true);
    seedInstallState(["claude"]);
    seedWiring("claude");

    const report = applyBootstrapState({ targetHome: home, sourcePath: REAL_SOURCE_PATH });

    expect(statusByHost(report.rows)).toEqual({ claude: "written" });
    const contract = fs.readFileSync(bootstrapContractPath("claude", home), "utf-8");
    expect(contract).toContain("massa-ai-config bootstrap enable");
    expect(contract).not.toContain("<!-- massa-ai:rule:");
  });
});
