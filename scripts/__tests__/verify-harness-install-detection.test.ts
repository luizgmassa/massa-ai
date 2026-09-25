/**
 * verify-harness-install-detection.test.ts — first coverage for
 * scripts/verify-harness-install.ts, specifically the `detected` field added
 * to every row of its --json output.
 *
 * Why this exists: the tool used to emit a flat 24-row array (4 hosts × 6
 * artifacts) with no host-detection concept — a host simply absent from the
 * machine produced six `missing` rows indistinguishable from a host whose
 * install is actually broken. `detected` mirrors installer_host_detected in
 * scripts/lib/installer-shared.sh (config dir under --home exists OR a host
 * binary is on PATH) so a row's `detected` agrees with whether
 * install-harness.sh would even consider that host a candidate to install.
 *
 * Every case runs the REAL scripts/verify-harness-install.ts as a child
 * process against a scratch --home (mktemp -d; the real $HOME is never
 * touched) with PATH scrubbed to a base guaranteed free of every host CLI
 * (claude/codex/cursor/cursor-agent/opencode), the same technique
 * scripts/tests/test-plugin-auto-install.sh uses (BASE_PATH) to make host
 * detection deterministic on a dev box that may have some of those CLIs
 * installed for real.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "verify-harness-install.ts");

// Scrubbed PATH: bun's own directory (so the child can still exec itself via
// node:fs/etc. built-ins — no external binary needed) plus a base guaranteed
// to hold no host CLI, mirroring test-plugin-auto-install.sh's BASE_PATH.
const BUN_DIR = path.dirname(process.execPath);
const SCRUBBED_PATH = `${BUN_DIR}:/usr/bin:/bin`;

const HOSTS = ["claude", "cursor", "codex", "opencode"] as const;
const ARTIFACTS = ["mcp", "plugin", "hooks", "skills", "commands", "subagents"] as const;

type Row = { host: string; artifact: string; status: string; detail: string; detected: boolean };

function runVerify(home: string, extraPath = SCRUBBED_PATH): { rows: Row[]; status: number | null } {
  const res = spawnSync(process.execPath, [SCRIPT, "--home", home, "--json"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 15_000,
    env: { ...process.env, PATH: extraPath },
  });
  if (res.status === null && res.error) {
    throw new Error(`verify-harness-install.ts failed to spawn: ${res.error.message}\nstderr: ${res.stderr}`);
  }
  let rows: Row[];
  try {
    rows = JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`--json output did not parse: ${e}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`);
  }
  return { rows, status: res.status };
}

describe("verify-harness-install.ts — host detection field", () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-verify-harness-"));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  test("emits exactly 24 rows (4 hosts x 6 artifacts), each carrying a detected boolean", () => {
    const { rows } = runVerify(home);
    expect(rows).toHaveLength(24);
    for (const h of HOSTS) {
      for (const a of ARTIFACTS) {
        const row = rows.find((r) => r.host === h && r.artifact === a);
        expect(row).toBeDefined();
        expect(typeof row!.detected).toBe("boolean");
      }
    }
  });

  test("an undetected host (no config dir under --home, no binary on PATH) is reported as undetected", () => {
    // Scratch home is empty — no ~/.claude, ~/.cursor, ~/.codex, or
    // ~/.config/opencode — and PATH is scrubbed, so every host is neither
    // dir-detected nor binary-detected.
    const { rows, status } = runVerify(home);
    for (const h of HOSTS) {
      const hostRows = rows.filter((r) => r.host === h);
      expect(hostRows).toHaveLength(6);
      for (const r of hostRows) {
        expect(r.detected).toBe(false);
        // Nothing is installed under an empty scratch home, so every artifact
        // for an undetected host reads "missing" here.
        expect(r.status).toBe("missing");
      }
    }
    // Exit-code semantics are documented as unchanged: missing rows still
    // fail the exit code even though every host here is undetected.
    expect(status).toBe(1);
  });

  test("a detected-but-empty host is reported as detected, with its artifacts still missing", async () => {
    // Only codex gets a config dir (dir-detection signal) — no MCP config,
    // no plugin dir, no hooks.json, no skills, no commands, no subagents
    // inside it, so every one of its 6 artifact checks stays "missing".
    await fs.mkdir(path.join(home, ".codex"), { recursive: true });

    const { rows } = runVerify(home);

    const codexRows = rows.filter((r) => r.host === "codex");
    expect(codexRows).toHaveLength(6);
    for (const r of codexRows) {
      expect(r.detected).toBe(true);
      expect(r.status).toBe("missing");
    }

    // Every other host has neither a config dir nor a PATH binary here, so
    // they stay undetected — proving detection is per-host, not global.
    for (const h of HOSTS.filter((h) => h !== "codex")) {
      for (const r of rows.filter((r) => r.host === h)) {
        expect(r.detected).toBe(false);
      }
    }
  });

  test("an undetected host's missing rows and a detected host's missing rows are distinguishable without reading `detail`", async () => {
    await fs.mkdir(path.join(home, ".codex"), { recursive: true });
    const { rows } = runVerify(home);

    const missing = rows.filter((r) => r.status === "missing");
    // Every host is fully missing in this fixture (codex is detected-but-empty,
    // the rest are undetected), so the full 24-row set is "missing" — the ONLY
    // thing that splits them into two real classes is `detected`, read as a
    // plain boolean field, with no need to parse any `detail` string.
    expect(missing).toHaveLength(24);
    const detectedMissing = missing.filter((r) => r.detected);
    const undetectedMissing = missing.filter((r) => !r.detected);
    expect(detectedMissing).toHaveLength(6);
    expect(detectedMissing.every((r) => r.host === "codex")).toBe(true);
    expect(undetectedMissing).toHaveLength(18);
    expect(undetectedMissing.every((r) => r.host !== "codex")).toBe(true);
  });

  test("--home is honoured by detection: the same host detects only when its dir exists under THIS --home", async () => {
    // Two disjoint scratch homes: cursor's dir exists only in the second.
    // Detection must track --home, not some ambient state.
    const { rows: before } = runVerify(home);
    expect(before.find((r) => r.host === "cursor" && r.artifact === "mcp")!.detected).toBe(false);

    const home2 = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-verify-harness-2-"));
    try {
      await fs.mkdir(path.join(home2, ".cursor"), { recursive: true });
      const { rows: after } = runVerify(home2);
      expect(after.find((r) => r.host === "cursor" && r.artifact === "mcp")!.detected).toBe(true);
      // The first scratch home is untouched by the second run.
      const { rows: stillBefore } = runVerify(home);
      expect(stillBefore.find((r) => r.host === "cursor" && r.artifact === "mcp")!.detected).toBe(false);
    } finally {
      await fs.rm(home2, { recursive: true, force: true });
    }
  });
});
