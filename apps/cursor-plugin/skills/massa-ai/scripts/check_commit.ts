#!/usr/bin/env bun
/**
 * check_commit.ts - deterministic Conventional Commits validation.
 *
 * The per-task atomic-commit rule mandates Conventional Commits 1.0.0. This makes
 * that rule checkable instead of trusting the model to remember the format. Bun
 * builtins only, zero dependencies, agent-agnostic.
 *
 * It reads the message from (in priority order): a positional file path, --message,
 * or stdin. The file-path form matches how git passes the message file to a
 * `commit-msg` hook, so this doubles as an optional git-level guard WITHOUT
 * coupling the skill to any AI agent:
 *
 *     ln -s skills/massa-ai/scripts/check_commit.ts .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg
 *
 * What it checks:
 *   ERROR  - header does not match  type(scope)!: description
 *            (an optional leading `[KEY] ` Jira-style prefix is stripped first -
 *            see massa-ai's `workflows/commit.md` §8, e.g. `[SA-142] feat(x): y`)
 *   ERROR  - type is not one of the allowed Conventional Commits types
 *   ERROR  - description is empty, starts uppercase, or ends with a period
 *   ERROR  - `!` breaking marker present but no `BREAKING CHANGE:` footer
 *   WARN   - header longer than 72 characters
 *
 * Usage:
 *   bun skills/massa-ai/scripts/check_commit.ts [msgfile]
 *   bun skills/massa-ai/scripts/check_commit.ts --message "feat(auth): add email validation"
 *   bun skills/massa-ai/scripts/check_commit.ts --message "[SA-142] feat(auth): reject expired tokens"
 *   echo "fix(cart): prevent negative quantity" | bun skills/massa-ai/scripts/check_commit.ts
 *
 * Exit codes: 0 pass, 1 violation, 2 usage error.
 */

import { readFileSync } from "node:fs";

const TYPES = ["feat", "fix", "refactor", "docs", "test", "style", "perf", "build", "ci", "chore"];

// massa-ai patch (D1c): an optional leading Jira-style key prefix, e.g.
// "[SA-142] feat(auth): reject expired tokens" (workflows/commit.md §8). The
// key shape mirrors the branch-key regex there: [A-Z][A-Z0-9]{1,9}-\d+.
const PREFIX_RE = /^\[(?<key>[A-Z][A-Z0-9]{1,9}-\d+)\]\s+(?<rest>.+)$/;
const HEADER_RE = /^(?<type>\w+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<desc>.+)$/;

const USAGE = "usage: check_commit.ts [-h] [--message MESSAGE] [msgfile]";
const HELP = `${USAGE}

Validate a Conventional Commits message.

positional arguments:
  msgfile               path to a commit message file (as git passes to commit-msg)

options:
  -h, --help            show this help message and exit
  --message MESSAGE     the commit message as a string`;

interface Args {
  msgfile: string | null;
  message: string | null;
}

/** Mirrors Python's str.splitlines(): universal newline split, no trailing empty element. */
function splitLines(text: string): string[] {
  if (text === "") return [];
  const result: string[] = [];
  const lineBreakRe = /\r\n|\r|\n/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = lineBreakRe.exec(text)) !== null) {
    result.push(text.slice(start, match.index));
    start = match.index + match[0].length;
  }
  if (start < text.length) {
    result.push(text.slice(start));
  }
  return result;
}

/** Mirrors Python's repr() for plain-text strings (single-quoted, backslash/quote/control escapes). */
function pyRepr(s: string): string {
  const hasSingle = s.includes("'");
  const hasDouble = s.includes('"');
  const quote = hasSingle && !hasDouble ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += "\\" + quote;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else {
      const code = ch.codePointAt(0)!;
      if (code < 0x20 || code === 0x7f) {
        out += "\\x" + code.toString(16).padStart(2, "0");
      } else {
        out += ch;
      }
    }
  }
  out += quote;
  return out;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\ncheck_commit.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  let message: string | null = null;
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--message") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --message: expected one argument");
        return null;
      }
      message = argv[++i];
    } else if (a.startsWith("--message=")) {
      message = a.slice("--message=".length);
    } else if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else if (a.startsWith("-") && a !== "-") {
      printUsageError(`unrecognized arguments: ${a}`);
      return null;
    } else {
      positionals.push(a);
    }
  }
  if (positionals.length > 1) {
    printUsageError(`unrecognized arguments: ${positionals.slice(1).join(" ")}`);
    return null;
  }
  return { msgfile: positionals[0] ?? null, message };
}

function readMessage(args: Args): string {
  if (args.message !== null) return args.message;
  if (args.msgfile) {
    return readFileSync(args.msgfile, "utf-8");
  }
  if (!process.stdin.isTTY) {
    try {
      return readFileSync(0, "utf-8");
    } catch {
      return "";
    }
  }
  return "";
}

function check(message: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Ignore comment lines (git puts '#' comments in the message file).
  let lines = splitLines(message).filter((ln) => !ln.trimStart().startsWith("#"));
  // Trim leading blank lines.
  while (lines.length && !lines[0]!.trim()) {
    lines.shift();
  }
  if (!lines.length) {
    return { errors: ["empty commit message"], warnings };
  }

  const header = lines[0]!.replace(/\s+$/, "");
  if (header.length > 72) {
    warnings.push(`header is ${header.length} chars (>72): ${header.slice(0, 60)}...`);
  }

  // Strip an optional massa-ai Jira-style `[KEY] ` prefix before matching the
  // Conventional Commits header shape.
  const prefixed = PREFIX_RE.exec(header);
  const headerBody = prefixed?.groups?.rest ?? header;

  const m = HEADER_RE.exec(headerBody);
  if (!m || !m.groups) {
    errors.push(`header does not match 'type(scope): description': ${pyRepr(header)}`);
    return { errors, warnings };
  }

  const ctype = m.groups.type!;
  const desc = m.groups.desc!;
  const bang = m.groups.bang;

  if (!TYPES.includes(ctype)) {
    errors.push(`type '${ctype}' is not one of: ${TYPES.join(", ")}`);
  }
  if (!desc.trim()) {
    errors.push("description is empty");
  } else {
    if (/\p{Lu}/u.test(desc[0]!)) {
      errors.push(`description should start lowercase: '${desc.slice(0, 30)}'`);
    }
    if (desc.replace(/\s+$/, "").endsWith(".")) {
      errors.push("description should not end with a period");
    }
  }

  const body = lines.slice(1).join("\n");
  const breakingFooter = /^BREAKING CHANGE:/m.test(body);
  if (bang && !breakingFooter) {
    errors.push("'!' breaking marker present but no 'BREAKING CHANGE:' footer");
  }

  return { errors, warnings };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;

  const message = readMessage(args);
  if (!message.trim()) {
    console.error("check_commit: no message provided (pass a file, --message, or pipe via stdin).");
    return 2;
  }

  const { errors, warnings } = check(message);
  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  if (errors.length) {
    console.log("\ncheck_commit: FAIL - see https://www.conventionalcommits.org/en/v1.0.0/");
    return 1;
  }
  console.log("check_commit: OK");
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
