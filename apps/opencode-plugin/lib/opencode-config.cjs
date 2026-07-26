"use strict";
/**
 * scripts/lib/opencode-config.cjs — massa-ai OpenCode config resolution (PDO-01..05).
 *
 * CommonJS on purpose: it is `require()`d from bash-embedded node/bun heredocs
 * (scripts/install-agents.sh) that get no module loader configuration, and it is
 * vendored byte-for-byte into apps/opencode-plugin/lib/opencode-config.cjs so that
 * plugin's install.sh works from an npm tarball, where scripts/lib/ does not exist. Any
 * change here must be mirrored there until a generator adopts it (tasks.md T11).
 *
 * Two independent installers used to hardcode "opencode.json" and parse it with bare
 * JSON.parse (scripts/install-agents.sh:161,198-207 and
 * apps/opencode-plugin/install.sh:61,118-137,198-219). Neither tolerated comments, and a
 * `.jsonc` user got either a silently-ignored second file or an aborted install. This
 * module is the single resolution + parse + write contract both installers route through.
 */

const fs = require("fs");
const path = require("path");

// ── resolveConfigPath ────────────────────────────────────────────────────────
// Resolution order (spec A1): opencode.jsonc -> opencode.json -> create
// opencode.jsonc. When BOTH exist, OpenCode core merges opencode.json OVER
// opencode.jsonc, so editing the losing .jsonc file would be a silent no-op — the
// caller must warn and this function reports `both: true` so it can.
function resolveConfigPath(dir) {
  const jsoncPath = path.join(dir, "opencode.jsonc");
  const jsonPath = path.join(dir, "opencode.json");
  const jsoncExists = fs.existsSync(jsoncPath);
  const jsonExists = fs.existsSync(jsonPath);

  if (jsoncExists && jsonExists) {
    return { path: jsonPath, created: false, both: true };
  }
  if (jsonExists) {
    return { path: jsonPath, created: false, both: false };
  }
  if (jsoncExists) {
    return { path: jsoncPath, created: false, both: false };
  }
  // Neither exists. `created: true` signals the caller that this path has no file
  // on disk yet — resolveConfigPath itself never touches the filesystem.
  return { path: jsoncPath, created: true, both: false };
}

// ── parseJsonc ───────────────────────────────────────────────────────────────
// A single left-to-right state machine, NOT a regex pipeline. Comment-stripping and
// trailing-comma removal both have to know whether they are inside a string literal —
// a value like "https://example.com" contains "//", and a string can legitimately
// contain a literal comma immediately before a quote that is followed by whitespace and
// a closing brace/bracket. Doing both passes in one scan, tracking string/escape state
// as we go, means neither transformation can ever misfire inside a string, because we
// simply never apply them there.
//
// Trailing commas are handled by holding a pending comma rather than emitting it
// immediately: if the next non-whitespace, non-comment token is "}" or "]", the held
// comma is dropped (that IS the trailing comma); otherwise it is flushed before
// whatever comes next. This requires no lookahead beyond one boolean flag.
function parseJsonc(text) {
  // Strip a leading UTF-8 BOM — documented OpenCode failure mode (spec edge case): a
  // BOM must be tolerated, not thrown on.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const n = src.length;

  let out = "";
  let i = 0;
  let inString = false;
  let escaped = false;
  let pendingComma = false;

  while (i < n) {
    const ch = src[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      if (pendingComma) {
        out += ",";
        pendingComma = false;
      }
      inString = true;
      out += ch;
      i++;
      continue;
    }

    if (ch === "/" && src[i + 1] === "/") {
      // Line comment: skip to (but not past) the newline, so line numbers in any
      // downstream JSON.parse error stay meaningful.
      i += 2;
      while (i < n && src[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2; // consume the closing "*/"; if unterminated, this walks off the end,
      // which is fine — JSON.parse below will reject the truncated result.
      continue;
    }

    if (ch === ",") {
      pendingComma = true;
      i++;
      continue;
    }

    if (ch === "}" || ch === "]") {
      // A pending comma directly before a closing brace/bracket is a trailing
      // comma — drop it rather than flush it.
      pendingComma = false;
      out += ch;
      i++;
      continue;
    }

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      // Whitespace never resolves a pending comma either way; keep scanning.
      out += ch;
      i++;
      continue;
    }

    if (pendingComma) {
      out += ",";
      pendingComma = false;
    }
    out += ch;
    i++;
  }
  if (pendingComma) out += ",";

  try {
    return JSON.parse(out);
  } catch (e) {
    // Deliberately generic — a genuinely malformed file (not merely commented) must
    // still throw so callers keep their existing "not valid JSON; refusing to
    // overwrite" refusal, which names the specific file. The filename is not known
    // here (this function only ever sees text), so that context is the caller's job.
    throw new Error(`not valid JSON: ${e.message}`);
  }
}

// ── writeConfig ──────────────────────────────────────────────────────────────
// Backup BEFORE write, every time, matching scripts/lib/installer-shared.sh's
// installer_backup_file convention exactly: "<path>.massa-ai.bak-<ts>", where <ts> is
// `date -u +%Y-%m-%dT%H-%M-%S-000Z`. Re-derived here in JS rather than shelling out to
// `date`, because this module is also required from apps/opencode-plugin/install.sh's
// vendored copy, which has no bash context to borrow a timestamp from.
function backupTimestamp() {
  return new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "-000Z");
}

function writeConfig(targetPath, cfg) {
  const backupPath = `${targetPath}.massa-ai.bak-${backupTimestamp()}`;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, backupPath);
  } else {
    // Reserve an empty marker so "a backup exists before every write" holds even on
    // first creation — same convention as installer_backup_file for every other host.
    fs.writeFileSync(backupPath, "");
  }
  fs.writeFileSync(targetPath, `${JSON.stringify(cfg, null, 2)}\n`);
  return backupPath;
}

module.exports = { resolveConfigPath, parseJsonc, writeConfig };
