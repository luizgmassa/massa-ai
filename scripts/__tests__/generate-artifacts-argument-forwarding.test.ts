/**
 * `generate:artifacts` argument forwarding (T28, BST-12 AC-1 as amended).
 *
 * `package.json`'s `generate:artifacts` was an `&&` chain of two generators, and
 * `bun run` appends a script's extra arguments to the **end of the command
 * string** — verified directly, not assumed: `bun run x --check` on a script
 * `a && b` runs `a && b --check`. So `--check` reached only the second
 * generator; the first ran in write mode and *repaired* the drift it was meant
 * to report, and a follow-up manual check then also passed.
 *
 * Measured at the parent commit with an unmanaged file planted in
 * `apps/claude-plugin/skills/bootstrap/`:
 *
 *   bun scripts/generate-skill-artifacts.ts --check   -> exit 1, names the file
 *   bun run generate:artifacts --check                -> exit 0, file deleted
 *
 * The second line is the whole defect: the named form did not merely miss the
 * drift, it silently destroyed the evidence. BST-12 AC-1 requires **both** forms
 * to discriminate — the documented command and the CI command
 * (`.github/workflows/ci.yml:238` runs the direct one), so that following the
 * documented one is not a trap.
 *
 * Environment note. Every spawn below inherits this process's environment
 * rather than pinning a scratch `XDG_CONFIG_HOME`. That is deliberate: a plain
 * emit resolves the model registry through the developer's profile overlay
 * while `--check` regenerates from the same resolution, so emit and check agree
 * exactly when they share an environment. A scratch config dir here would make
 * the check compare builtin-only output against a tree `pretest:scripts`
 * emitted with the overlay, and manufacture drift that CI never sees.
 */

import { describe, test, expect } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");

/**
 * The planted drift. A stale *extra* file inside a managed bundle root, not an
 * edit to a generated file: `--check` diffs full directory inventories per
 * managed subtree, so an unexpected entry is drift it must report, and removing
 * the file is a complete restore with no bytes to compare back.
 *
 * `skills/bootstrap/` belongs to `generate-skill-artifacts.ts` — the **first**
 * link of the chain, which is the one the broken form skipped. Its own name,
 * distinct from `skill-artifact-parity.test.ts`'s `UNMANAGED.md`, so the two
 * planted files can never be mistaken for each other in a failure message.
 */
const STALE = path.join(
  REPO_ROOT,
  "apps/claude-plugin/skills/bootstrap/T28-ARGUMENT-FORWARDING-PROBE.md",
);

/** A generated artifact owned by the **second** generator. Deleting it and
 *  watching a plain run restore it is what proves the no-flag path still
 *  reaches both links — every `pretest:*` hook in this repo depends on that. */
const AGENT_ARTIFACT = path.join(REPO_ROOT, "apps/claude-plugin/agents/massa-ai-builder.md");

function run(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync("bun", [...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 180_000,
  });
}

const namedCheck = () => run(["run", "generate:artifacts", "--check"]);
const directCheck = () => run(["scripts/generate-skill-artifacts.ts", "--check"]);
const output = (res: SpawnSyncReturns<string>) => `${res.stdout ?? ""}${res.stderr ?? ""}`;

function plantStale(): void {
  fs.writeFileSync(STALE, "planted by generate-artifacts-argument-forwarding.test.ts\n");
}

describe("generate:artifacts forwards its arguments to both generators (BST-12 AC-1)", () => {
  test("the documented named form exits non-zero against planted bundle drift", () => {
    // Control first. A clean tree must check clean, or a non-zero exit below
    // would prove nothing about the planted file — this is the assertion that
    // fails, loudly and in the right place, on a machine whose generated tree
    // is already drifted for some unrelated reason.
    const clean = namedCheck();
    expect(clean.status).toBe(0);

    try {
      plantStale();
      const drifted = namedCheck();
      expect(drifted.status).not.toBe(0);
      // Named, not merely non-zero: the exit code alone would be satisfied by
      // any failure, including the second generator reporting unrelated drift.
      expect(output(drifted)).toContain(path.basename(STALE));
    } finally {
      fs.rmSync(STALE, { force: true });
    }
  }, 300_000);

  test("the direct form CI runs keeps discriminating unchanged (ci.yml:238)", () => {
    try {
      plantStale();
      const drifted = directCheck();
      expect(drifted.status).not.toBe(0);
      expect(output(drifted)).toContain(path.basename(STALE));
    } finally {
      fs.rmSync(STALE, { force: true });
    }
  }, 300_000);

  test("with no flag both generators still run in write mode", () => {
    // The regression this fix could plausibly cause. `pretest:scripts`,
    // `pretest:plugins`, `pretest:coverage` and the opencode package's own
    // `pretest` all invoke the bare script and depend on it emitting; a
    // forwarding form that broke the no-argument path would leave every one of
    // them silently generating nothing.
    const agentBefore = fs.readFileSync(AGENT_ARTIFACT);
    try {
      plantStale();
      fs.rmSync(AGENT_ARTIFACT, { force: true });

      const res = run(["run", "generate:artifacts"]);
      expect(res.status).toBe(0);

      // First generator: prune reached into the bundle and removed the stale file.
      expect(fs.existsSync(STALE)).toBe(false);
      // Second generator: the deleted artifact was re-emitted, byte-identical.
      expect(fs.existsSync(AGENT_ARTIFACT)).toBe(true);
      expect(fs.readFileSync(AGENT_ARTIFACT).equals(agentBefore)).toBe(true);
    } finally {
      fs.rmSync(STALE, { force: true });
      if (!fs.existsSync(AGENT_ARTIFACT)) fs.writeFileSync(AGENT_ARTIFACT, agentBefore);
    }
  }, 300_000);
});
