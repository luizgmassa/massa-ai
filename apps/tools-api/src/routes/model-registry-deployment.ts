/**
 * Deployment-root resolver for the model-registry surface (design D-2, APCR-07).
 *
 * A fixed `../../../../` climb from `import.meta.dirname` encodes the module's
 * position in the source tree: correct only from `apps/tools-api/src/routes/`,
 * wrong from a bundled `dist/` (one level shallower), and meaningless in a
 * deployment that never shipped `scripts/` at all — the published npm package
 * (`files: ["dist"]`) and the Docker `api` image (`Dockerfile:40-44` copies
 * `packages` + `apps/{tools-api,web-ui,mcp-client,opencode-plugin}`, never
 * `scripts/`). Replace it with a bounded upward walk for a repo marker,
 * resolved once per process and memoized — a superset of every position where
 * the old fixed climb worked, resolving to `null` instead of throwing
 * (MODULE_NOT_FOUND / a spawn failure) when the marker is not found.
 *
 * Shipping `scripts/` into the image to make the walk succeed there is a
 * rejected alternative (TD-6): the generator's charter sources
 * (`skills/agents/`) and 3 of its 4 output roots
 * (`apps/{claude,codex,cursor}-plugin/`) are absent from the image too, so it
 * would run and emit a wrong/empty artifact set — worse than a diagnosable 501.
 */

import fs from "fs";
import path from "path";

const MARKER = path.join("scripts", "generate-subagent-artifacts.ts");
/** A superset of every measured working position (4 up in a dev checkout, 3
 *  up from a bundled dist/) with headroom to spare. */
const MAX_LEVELS = 6;

let cachedRoot: string | null | undefined;

/** Pure, parameterized search — exported so the bounded-walk contract (finds a marker N
 *  levels up, resolves to `null` rather than throwing once the filesystem root is reached)
 *  is directly testable without depending on this module's own on-disk position. */
export function findDeploymentRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i <= MAX_LEVELS; i++) {
    if (fs.existsSync(path.join(dir, MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  return null;
}

/** Resolves and memoizes the repo root housing `scripts/generate-subagent-artifacts.ts`,
 *  or `null` when this deployment does not have one. Memoized per process — the
 *  deployment shape cannot change between requests. */
export function getDeploymentRoot(): string | null {
  if (cachedRoot === undefined) {
    cachedRoot = findDeploymentRoot(import.meta.dirname);
  }
  return cachedRoot;
}

/** Test-only reset, mirroring the reset*() convention this codebase uses for
 *  memoized factories. */
export function __resetDeploymentRootCacheForTests(): void {
  cachedRoot = undefined;
}

/** One 501 message shape (design D-2), shared by the three JSON routes and — as the
 *  terminal `done` frame's `error` field — by the two SSE routes. */
export function deploymentUnavailableMessage(what: string): string {
  return (
    `model-registry is unavailable in this deployment: ${what} was not found under ` +
    `${import.meta.dirname} (searched up ${MAX_LEVELS} levels). This route requires a ` +
    `massa-ai source checkout.`
  );
}
