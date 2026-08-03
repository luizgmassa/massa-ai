/**
 * @massa-ai/core - Project-root identity for index_project
 *
 * Module 8b of the `tools/index_project.ts` extraction (PR-D, T14; the one row
 * of `design.md` §5.1's table whose destination path was fixed before Execute).
 * Owns the request-root identity half of `index_project`'s synchronous
 * validation: the canonical form of a requested root, and the guard that a
 * reused projectId still points at the same canonical root.
 *
 * THE BODIES ARE MOVED VERBATIM (RFS-02 AC-1's behavior-preserving contract).
 * `type CanonicalizePath` and the `realpath` import travel with them because
 * their only readers were these two functions — 2 references inside the moved
 * span, 0 elsewhere in the handler, for each — the same reader-count rule that
 * decided T14b's departing imports.
 *
 * NOT RE-EXPORTED from `./index.ts`, and that is a decision rather than an
 * omission: `services/index.ts` re-exports that barrel wholesale onto
 * `@massa-ai/core`'s published `./services` surface, so a barrel entry would
 * add two names to the package for no consumer (`design.md` §5.1 rejects
 * exactly this for `services/file-read/`). The consumers — the handler and its
 * suites — deep-import this module.
 *
 * IT SHARES A DIRECTORY WITH THE TRANSACTIONAL RENAME/MERGE MACHINERY AND
 * DELIBERATELY TAKES NO PART IN IT. These helpers are stateless per-request
 * checks; they hold no cache, so `ProjectIdentityInvalidatorRegistry` has
 * nothing of theirs to invalidate, and a reader extending the rename flow
 * should not look for a hook here.
 */
import { realpath } from "node:fs/promises";
import path from "path";

type CanonicalizePath = (projectPath: string) => Promise<string>;

export async function canonicalizeProjectRoot(
  projectPath: string,
  canonicalize: CanonicalizePath = realpath,
): Promise<string> {
  return canonicalize(path.resolve(projectPath));
}

export async function assertProjectRootReuse(options: {
  projectId: string;
  canonicalProjectPath: string;
  storedProjectPath?: string | null;
  forceReindex: boolean;
  canonicalize?: CanonicalizePath;
}): Promise<void> {
  if (!options.storedProjectPath || options.forceReindex) return;
  const canonicalize = options.canonicalize ?? realpath;
  let storedCanonical: string;
  try {
    storedCanonical = await canonicalize(path.resolve(options.storedProjectPath));
  } catch {
    storedCanonical = path.resolve(options.storedProjectPath);
  }
  if (storedCanonical !== options.canonicalProjectPath) {
    throw new Error(
      `Project ID "${options.projectId}" already indexes canonical root ` +
        `"${storedCanonical}", not "${options.canonicalProjectPath}"; ` +
        "use forceReindex only after verifying ownership of the existing project",
    );
  }
}
