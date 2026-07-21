/**
 * Shell-arg validation for git refs (`base_branch` / `since`).
 *
 * `defaultDiffRunner` uses `execFileSync("git", [...])`, which already
 * prevents shell injection (no `sh -c`). This guard prevents the git CLI's
 * own arg-injection surface — e.g. `base_branch = "--upload-pack=evil"` —
 * from being passed to git as an option-flag instead of a revision.
 *
 * Spec AC 10 (N8): reject values starting with `--` or containing
 * `\r`, `\n`, `;`, `|`, `&`, `$`, `<`, `>`, `(`, `)`, `{`, `}`, or `\`.
 * The accepted pattern is `/^[A-Za-z0-9._\/+-]+$/` (covers branch names,
 * tags, SHAs, ISO dates, and `origin/main`-style refs).
 */

import { ToolError } from "../../tools/enum-validation.js";

const GIT_REF_PATTERN = /^[A-Za-z0-9._\/+-]+$/;

/**
 * Validate a git ref param before it reaches `execFileSync("git", [...])`.
 *
 * Empty string is ALLOWED here — the caller (`defaultDiffRunner`) treats an
 * empty `base_branch` as "fall back to `main`", so we do not reject it at
 * the validation layer. Non-empty values must match the accepted pattern
 * and must not start with `--` (git arg-injection).
 *
 * @throws ToolError("Invalid <paramName> value: <value>. Valid pattern: ...")
 *   when `value` starts with `--` or fails the accepted pattern.
 */
export function validateGitRef(paramName: string, value: string): void {
  if (value === "") return; // caller handles empty → default "main"
  if (value.startsWith("--") || !GIT_REF_PATTERN.test(value)) {
    throw new ToolError(
      `Invalid ${paramName} value: ${value}. Valid pattern: alphanumeric, -, /, ., _, +.`,
    );
  }
}