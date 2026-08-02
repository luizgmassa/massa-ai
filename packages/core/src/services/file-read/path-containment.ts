/**
 * @massa-ai/core - Path resolution and filesystem containment
 *
 * Module 2 of the `tools/read_file.ts` extraction (PR-D, T9). Holds the two
 * security-sensitive path functions `ReadFileTool` used to carry as private
 * methods: `resolveFilePath` (absolute / projectId / ambiguous) and
 * `checkPathContainment` (Wave 5 FR-12 / AD-W5-006).
 *
 * BOTH BODIES ARE MOVED VERBATIM. RFS-01's gate is structural and cannot tell a
 * correct delegate from a widened one (RFS-01 AC-6), and `check-core-layering`
 * cannot either, so this module's only real sensor is its tests —
 * `__tests__/read-file-containment-shapes.test.ts` (RFS-06, the three mutation
 * shapes all seven pre-existing containment tests fail to kill) plus
 * `__tests__/path-containment.test.ts`. Neither the containment predicate nor
 * the teaching-error text may drift here; RFS-06 AC-2 pins the latter.
 *
 * It takes the project-root cache as a constructor dependency. `design.md` §5.1
 * names the 2 → 3 edge as real and one-directional — "module 2 cannot be
 * constructed without module 3" — but chooses no mechanism, unlike the 4 → 5
 * edge it hands to Tasks explicitly (`tasks.md` §4.1). Constructor injection is
 * chosen over a `getProjectRoot` callback because the two are behaviorally
 * indistinguishable here (module 3 caches, so neither adds a lookup) and the
 * direct edge is the one §5.1 describes; the callback shape exists in §4.1/§4.2
 * to stop a module NAMING a heavy collaborator, and module 3 is neither heavy
 * nor a type this module would otherwise avoid.
 */
import { sanitizeFilePath } from "@massa-ai/shared";
import path from "path";
import type { ProjectRootCache } from "./project-root-cache.js";

export class PathContainment {
  constructor(private readonly projectRoots: ProjectRootCache) {}

  /**
   * Resolve a filePath to an absolute path.
   *
   * Resolution rules:
   *  - Absolute path → returned verbatim (still normalized via path.resolve, but base-independent).
   *  - `projectId` present → resolved against the workspace `project_path`. If the
   *    workspace lookup fails (no root), this returns null (ambiguous).
   *  - No `projectId` AND relative `filePath` → returns null. We deliberately do NOT
   *    fall back to `path.resolve(filePath)` against process.cwd(), because a
   *    relative path arriving without a projectId is ambiguous and historically
   *    read from the server's cwd (COVERAGE finding #3). Callers must provide an
   *    absolute path or a projectId.
   *
   * Returns null to signal an ambiguous/unsatisfiable path so `handle()` can map it
   * to a distinct, clear error instead of the generic "Failed to read file" catch.
   */
  async resolveFilePath(filePath: string, projectId?: string): Promise<string | null> {
    if (path.isAbsolute(filePath)) {
      return path.resolve(filePath);
    }
    if (projectId) {
      const root = await this.projectRoots.getProjectRoot(projectId);
      if (root) {
        // Wave 5 FR-12: strip ../ traversal tokens from relative paths before
        // resolving under the project root. sanitizeFilePath removes ../ and
        // ..\ segments so a crafted relative path can't escape the root.
        const cleaned = sanitizeFilePath(filePath);
        return path.resolve(root, cleaned);
      }
      return null;
    }
    // Relative path with no projectId — do not guess against cwd.
    return null;
  }

  /**
   * Wave 5 FR-12 / AD-W5-006: filesystem-side path containment.
   *
   * An absolute path is allowed iff it resolves under one of:
   *   1. the project root (workspace lookup for projectId, when provided)
   *   2. process.cwd()
   *   3. an entry in MASSA_AI_READ_FILE_ROOTS (colon-separated env)
   *
   * Project root + cwd are ALWAYS allowed. Outside → teaching error listing
   * valid roots only (no host path enumeration). The check uses path.relative
   * to detect traversal out of a root (a result starting with ".." or an
   * absolute path on another drive means outside).
   *
   * The env allowlist is read at CALL TIME (not config-load time) so test
   * suites and runtime operators can set it without restarting the process.
   * config.readFile.extraRoots mirrors the same env for introspection.
   *
   * Returns { allowed: true } on success, or { allowed: false, error } with a
   * Wave-4-N6-style teaching error listing the valid roots.
   */
  async checkPathContainment(
    absoluteFilePath: string,
    projectId?: string,
  ): Promise<{ allowed: true } | { allowed: false; error: string }> {
    // Collect valid roots. Project root is included only when actually
    // resolvable (workspace lookup succeeds); cwd is always available.
    const roots: string[] = [];
    if (projectId) {
      const root = await this.projectRoots.getProjectRoot(projectId);
      if (root) roots.push(path.resolve(root));
    }
    roots.push(path.resolve(process.cwd()));
    // Read the env allowlist at call time so tests/operators can set it
    // without restarting the process. Colon-separated (POSIX-style).
    const envRoots = (process.env.MASSA_AI_READ_FILE_ROOTS ?? "")
      .split(":")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const extra of envRoots) {
      roots.push(path.resolve(extra));
    }

    const target = path.resolve(absoluteFilePath);
    for (const root of roots) {
      const rel = path.relative(root, target);
      // Inside iff rel does not start with ".." and is not absolute (cross-drive).
      if (rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)) {
        return { allowed: true };
      }
      // Exact root match (rel === "") is also inside.
      if (rel === "") return { allowed: true };
    }
    // Outside all roots → teaching error listing valid roots only.
    const validRootsList = roots.map((r) => `  - ${r}`).join("\n");
    return {
      allowed: false,
      error:
        `read_file path containment: "${target}" is outside the allowed roots.\n` +
        `Valid roots (project root + cwd + MASSA_AI_READ_FILE_ROOTS):\n${validRootsList}\n` +
        `Provide a filePath that resolves under one of these roots.`,
    };
  }
}
