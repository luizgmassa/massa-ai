/**
 * Agent-file ownership: which files in a host's shared agents directory
 * massa-ai may overwrite or delete. Ownership is a content marker, never a
 * filename, plus a legacy rule so an upgrade can prune the pre-rename
 * `massa-ai-<name>` files. The bash installers inline the same predicates
 * (`is_owned_agent`, `is_owned_agent_toml`, `is_owned_agent_link`);
 * `scripts/__tests__/agent-ownership-parity.test.ts` runs one fixture set
 * through both and requires identical verdicts.
 */
import fs from "node:fs";
import path from "node:path";

export const OWNED_MARKER_MD = "<!-- massa-ai-owned: true -->";
export const OWNED_MARKER_TOML = "# massa-ai-owned";

/** The 18 charter names that shipped with the `massa-ai-` prefix. Exact
 * names only, never an open `massa-ai-*` glob: a user's unmarked
 * `massa-ai-mine.md` is not ours. */
export const LEGACY_AGENT_NAMES: readonly string[] = [
  "architecture-specialist",
  "audit-specialist",
  "builder",
  "context-curator",
  "designer",
  "documentation-agent",
  "furps-analyst",
  "investigator",
  "judge",
  "meta-judge",
  "mobile-specialist",
  "navigator",
  "plan-critic",
  "planner",
  "requirements-analyst",
  "reviewer",
  "test-engineer",
  "verification-agent",
];

/** `massa-ai-<one of the 18 legacy names>.<ext>`. */
export function isLegacyAgentName(fileName: string): boolean {
  const base = path.basename(fileName).replace(/\.[^.]*$/, "");
  return base.startsWith("massa-ai-") && LEGACY_AGENT_NAMES.includes(base.slice("massa-ai-".length));
}

/** The first body line — the line right after the closing frontmatter
 * fence — is exactly the marker. A file without frontmatter is never owned. */
export function hasOwnedMarker(content: string): boolean {
  const lines = content.split("\n");
  if (lines[0] !== "---") return false;
  const close = lines.indexOf("---", 1);
  return close !== -1 && lines[close + 1] === OWNED_MARKER_MD;
}

function isRegularFile(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** A regular (non-symlink) agent file massa-ai owns: `.toml` — first line is
 * `# massa-ai-owned`; `.md` — a legacy name or the body marker. */
export function isOwnedAgentFile(filePath: string): boolean {
  if (!isRegularFile(filePath)) return false;
  if (!filePath.endsWith(".toml") && isLegacyAgentName(filePath)) return true;
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return false;
  }
  if (filePath.endsWith(".toml")) return content.split("\n")[0] === OWNED_MARKER_TOML;
  return hasOwnedMarker(content);
}

/** OpenCode: agents install as symlinks. Owned iff a symlink that is
 * legacy-named, or whose link text points into a massa-ai bundle
 * (`…/opencode-plugin/agents/<base>` or
 * `…/plugins/massa-ai/agent-profiles/<p>/<base>` — so a dangling link from a
 * deleted checkout still counts), or whose target carries the body marker. */
export function isOwnedAgentLink(linkPath: string): boolean {
  try {
    if (!fs.lstatSync(linkPath).isSymbolicLink()) return false;
  } catch {
    return false;
  }
  if (isLegacyAgentName(linkPath)) return true;
  const base = path.basename(linkPath);
  const target = fs.readlinkSync(linkPath);
  if (target.endsWith(`/opencode-plugin/agents/${base}`)) return true;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`/plugins/massa-ai/agent-profiles/.*/${escaped}$`).test(target)) return true;
  try {
    return fs.statSync(linkPath).isFile() && hasOwnedMarker(fs.readFileSync(linkPath, "utf8"));
  } catch {
    return false;
  }
}
