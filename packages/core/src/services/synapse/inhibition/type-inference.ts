/**
 * Type inference from filePath — heuristics that let chain-inhibition
 * operate on code-search results which carry no `metadata.type`.
 *
 * Rules (most specific first):
 *   - tests / __tests__ / *.test.ts / *.spec.ts → "code-test"
 *   - docs/ / *.md / *.mdx / README              → "documentation"
 *   - changelogs / CHANGELOG / migrations        → "code"  (treated as code)
 *   - default for source extensions              → "code"
 *
 * Returns `null` when the path provides no useful signal.
 */

const TEST_PATH_RE = /(?:^|\/)(?:__tests__|tests?|spec)\//i;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|py|go|rs|java|dart)$/i;
const DOC_PATH_RE = /(?:^|\/)(?:docs?|documentation)\//i;
const DOC_FILE_RE = /\.(?:md|mdx|rst|txt)$/i;
const README_RE = /(?:^|\/)README(?:\.|$)/i;
const CHANGELOG_RE = /(?:^|\/)CHANGELOG(?:\.|$)/i;
const MIGRATION_RE = /(?:^|\/)migrations\//i;
const SOURCE_EXT_RE =
  /\.(?:ts|tsx|js|jsx|py|go|rs|java|cpp|c|h|hpp|cs|rb|kt|swift|dart|scala|php|lua|sh|sql)$/i;

export function inferTypeFromPath(filePath: string | undefined | null): string | null {
  if (!filePath || filePath.length === 0) return null;

  if (TEST_PATH_RE.test(filePath) || TEST_FILE_RE.test(filePath)) return "code-test";
  if (DOC_PATH_RE.test(filePath) || DOC_FILE_RE.test(filePath) || README_RE.test(filePath))
    return "documentation";
  if (CHANGELOG_RE.test(filePath)) return "documentation";
  if (MIGRATION_RE.test(filePath)) return "code";
  if (SOURCE_EXT_RE.test(filePath)) return "code";

  return null;
}
