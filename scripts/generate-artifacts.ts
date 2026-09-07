#!/usr/bin/env bun
/**
 * Single entrypoint for every generated harness artifact.
 *
 * `bun run generate:artifacts` used to be `bun a.ts && bun b.ts`, and a package
 * script appends the caller's arguments to the END of that string. So
 * `bun run generate:artifacts --check` expanded to
 *
 *     bun scripts/generate-skill-artifacts.ts && bun scripts/generate-subagent-artifacts.ts --check
 *
 * — the flag reached only the second generator, and the skill-artifacts half
 * ran in WRITE mode. A drift gate that silently regenerates the thing it is
 * checking cannot fail, and half of `--check`'s subject was therefore
 * unguarded wherever that form was used.
 *
 * `CONTRIBUTING.md` Step 3 names this class directly: a harness component that
 * delegates to other commands "MUST NOT silently drop arguments the caller
 * passed", with the acceptance gate being "a test verifies that arguments
 * passed by the caller reach the underlying command". That test is
 * `scripts/__tests__/generate-artifacts-argv.test.ts`.
 *
 * Both generators export the same `main(argv): Promise<number>` signature and
 * both guard their auto-run behind `import.meta.main`, so this forwards argv
 * by direct call rather than by spawning — no second Bun startup, and no shell
 * quoting to get wrong.
 *
 * One deliberate behaviour change beyond argv: `&&` stopped at the first
 * non-zero, so a drift report for the skill bundles hid any drift in the
 * sub-agent artifacts. Every generator now runs, and the first non-zero code is
 * returned, so one `--check` reports every drifted subtree instead of the
 * first. A generator that *throws* still propagates immediately — that is a
 * fault, not a finding.
 *
 * Usage:
 *   bun scripts/generate-artifacts.ts            # emit
 *   bun scripts/generate-artifacts.ts --check    # drift gate (0 clean, 1 drift)
 *   bun scripts/generate-artifacts.ts --profile=work
 */

import { main as generateSkillArtifacts } from "./generate-skill-artifacts.ts";
import { main as generateSubagentArtifacts } from "./generate-subagent-artifacts.ts";

export interface ArtifactGenerator {
  /** Script basename, used in the failure line so a non-zero code names its source. */
  readonly name: string;
  readonly run: (argv: string[]) => Promise<number>;
}

/**
 * Order is the historical one: skill bundles first, sub-agent artifacts second.
 * Both write disjoint subtrees under `apps/<host>-plugin/`, so the order is not
 * a correctness requirement — it is preserved so console output reads the same
 * as it did before this wrapper existed.
 */
export const GENERATORS: readonly ArtifactGenerator[] = [
  { name: "generate-skill-artifacts", run: generateSkillArtifacts },
  { name: "generate-subagent-artifacts", run: generateSubagentArtifacts },
];

export async function main(
  argv: string[] = process.argv.slice(2),
  generators: readonly ArtifactGenerator[] = GENERATORS,
): Promise<number> {
  let firstFailure = 0;

  for (const generator of generators) {
    const code = await generator.run(argv);
    if (code !== 0) {
      console.error(`[generate-artifacts] ${generator.name} exited ${code}`);
      if (firstFailure === 0) firstFailure = code;
    }
  }

  return firstFailure;
}

if (import.meta.main) {
  const code = await main();
  if (code !== 0) {
    process.exit(code);
  }
}
