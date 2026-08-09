/**
 * Generic bounded upward filesystem-marker walk, factored out of
 * `apps/tools-api/src/routes/model-registry-deployment.ts`'s
 * `findDeploymentRoot` so every caller needing "find the repo root housing
 * marker X, resolving to null rather than throwing" shares one
 * implementation instead of hand-rolling the same loop: `findDeploymentRoot`
 * itself (delegates here, keeping its own exported signature, MARKER/
 * MAX_LEVELS constants, memoization and 501-message shaping unchanged),
 * `variant-sync.ts`'s tools-api callers, and the two published config-CLIs
 * (`apps/mcp-client`, `apps/opencode-plugin`) — which cannot depend on
 * `scripts/` at all and need this same walk to find a dev checkout's
 * `sourceRoot` for `syncGeneratedVariants`.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Walks upward from `startDir` through up to `maxLevels` parent directories
 * (0 = `startDir` itself, inclusive) looking for `marker` — a path, taken
 * relative to each candidate directory, whose existence identifies the repo
 * root. Resolves to `null`, never throws, once the filesystem root is
 * reached or the level budget is exhausted without a match.
 */
export function findRepoRootWithMarker(startDir: string, marker: string, maxLevels: number): string | null {
  let dir = startDir;
  for (let i = 0; i <= maxLevels; i++) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  return null;
}
