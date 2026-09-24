"use strict";
/**
 * scripts/lib/opencode-config.cjs — massa-ai OpenCode config resolution (PDO-01..05).
 *
 * CommonJS on purpose: it is `require()`d from bash-embedded node/bun heredocs
 * (scripts/install-agents.sh) that get no module loader configuration, and it is
 * vendored byte-for-byte into apps/opencode-plugin/lib/opencode-config.cjs so that
 * plugin's install.sh works from an npm tarball, where scripts/lib/ does not exist. That
 * mirror is generated, not hand-copied (scripts/generate-skill-artifacts.ts:59,176-182),
 * and is gitignored build output (AD-016): after editing this file run
 * `bun scripts/generate-skill-artifacts.ts --check` — the drift gate CI runs.
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

// ── instructionsOp ───────────────────────────────────────────────────────────
// The four-mode contract design.md:449 requires of the OpenCode config write,
// mirroring bootstrap_engine (scripts/install-skills.sh:459-617) mode for mode:
//
//   plan          — would the entry be added? NO filesystem contact at all
//   apply         — add the entry, backing up and writing only when it changes
//   remove-plan   — is the entry present? NO filesystem contact at all
//   remove-apply  — drop the entry, deleting the array when it empties
//
// It layers over writeConfig rather than living inside it. A plan mode with zero
// filesystem contact has to be handed the current document, and writeConfig's two
// existing call sites (scripts/install-agents.sh:149-176 and
// apps/opencode-plugin/install.sh:132,548-575) pass only the desired one; both are
// outside this task's write set, so writeConfig keeps its two-argument signature as
// the unconditional write primitive and the mode dispatch gets its own name.
//
// Why not a compare-then-skip guard inside writeConfig: it reads the target and
// writes whenever the read differs from the desired document — which is exactly the
// drift state `--check` exists to report. It would strip a .jsonc user's comments
// and drop a backup, without consent, in the one state where --check is interesting
// (design.md:449, :477). Hence "no filesystem contact", not "no net change".
const INSTRUCTIONS_KEY = "instructions";
const CONTRACT_BASENAME = "MASSA-AI.md";

// design.md:440 — an `instructions` entry is a bare string with nowhere to carry an
// ownership marker, so removal can only match the exact absolute path. An entry a
// previous install wrote under a different home or a different --target is
// indistinguishable from one the user typed, and is left alone. Saying so is the
// requirement (BST-05 AC-9): the caller prints these notes in its uninstall report.
const ORPHAN_LIMITATION_NOTE =
  "an `instructions` entry carries no ownership marker, so uninstall removes only the exact path it installed; " +
  "an entry written under a different home or a different --target is left in place";

// Entries that look like a massa-ai contract path but are not the one being removed.
// Named individually so the report points at the line the user has to delete by hand.
function orphanContractEntries(cfg, entry) {
  const current = cfg[INSTRUCTIONS_KEY];
  if (!Array.isArray(current)) return [];
  return current.filter(
    (x) =>
      typeof x === "string" &&
      x !== entry &&
      (x === CONTRACT_BASENAME || x.endsWith(`/${CONTRACT_BASENAME}`)),
  );
}

// Returns the document to write, or null for "nochange". Never mutates `cfg` — a
// plan mode that dirtied the caller's parsed document would make the following
// apply write a change it never planned.
function nextDocument(cfg, entry, removing) {
  const current = Array.isArray(cfg[INSTRUCTIONS_KEY]) ? cfg[INSTRUCTIONS_KEY] : null;

  if (removing) {
    if (current === null || !current.includes(entry)) return null;
    // filter, not indexOf+splice: a duplicate left by an earlier buggy run must go
    // too. Shape from apps/opencode-plugin/install.sh:488-495.
    const kept = current.filter((x) => x !== entry);
    const next = { ...cfg };
    if (kept.length === 0) delete next[INSTRUCTIONS_KEY];
    else next[INSTRUCTIONS_KEY] = kept;
    return next;
  }

  // Push-if-absent, the shape at apps/opencode-plugin/install.sh:554-575. A
  // non-array `instructions` is replaced rather than coerced, matching that call
  // site's `if (!Array.isArray(cfg.plugin)) cfg.plugin = []` — OpenCode's schema
  // types the field string[], so any other value is already an invalid document.
  if (current !== null && current.includes(entry)) return null;
  return { ...cfg, [INSTRUCTIONS_KEY]: current === null ? [entry] : [...current, entry] };
}

// instructionsOp(mode, targetPath, cfg, entry)
//   cfg   — the ALREADY-PARSED current document. Every caller reads and parseJsoncs
//           the file before calling (that is where BST-03 AC-11's named
//           "not valid JSON: …" throw comes from, and why a plan mode needs no read
//           of its own). This function never parses and never catches: an
//           unparseable config never reaches it, so it can write no partial change.
//   entry — the absolute path to add to / remove from `instructions`.
// Returns { result: "change" | "nochange", backupPath: string | null, notes: string[] }.
// `result` is the same two-token vocabulary bootstrap_engine writes to stdout.
function instructionsOp(mode, targetPath, cfg, entry) {
  const removing = mode === "remove-plan" || mode === "remove-apply";
  const planning = mode === "plan" || mode === "remove-plan";
  if (!removing && mode !== "plan" && mode !== "apply") {
    throw new Error(`unknown mode: ${mode}`);
  }

  const notes = removing
    ? [
        ORPHAN_LIMITATION_NOTE,
        ...orphanContractEntries(cfg, entry).map(
          (x) => `orphan instructions entry left in place: ${x}`,
        ),
      ]
    : [];

  const next = nextDocument(cfg, entry, removing);
  if (next === null) return { result: "nochange", backupPath: null, notes };
  // Planning stops here, before any fs call — including the backup writeConfig
  // would otherwise reserve. That absence is the contract, so it is sensed as
  // "the module made no fs call", not as "the bytes did not change"
  // (scripts/__tests__/opencode-config.test.ts, the plan-mode describe block).
  if (planning) return { result: "change", backupPath: null, notes };

  return { result: "change", backupPath: writeConfig(targetPath, next), notes };
}

module.exports = {
  resolveConfigPath,
  parseJsonc,
  writeConfig,
  instructionsOp,
  ORPHAN_LIMITATION_NOTE,
};
