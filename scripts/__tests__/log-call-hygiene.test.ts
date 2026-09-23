import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const SOURCE_ROOTS = ["apps/tools-api/src", "packages/core/src", "packages/shared/src", "apps/mcp-client/src"];

interface LogCall {
  file: string;
  level: "warn" | "error";
  line: number;
  args: string[];
}

function productionFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "--", ...SOURCE_ROOTS.map((r) => `${r}/**/*.ts`)], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out
    .split("\n")
    .filter((f) => f && !f.includes("__tests__") && !f.endsWith(".test.ts") && !f.includes("/generated/"));
}

function skipString(src: string, i: number): number {
  const quote = src[i];
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (quote === "`" && c === "$" && src[i + 1] === "{") {
      i = matchClose(src, i + 1, "{", "}") + 1;
      continue;
    }
    if (c === quote) return i + 1;
    i++;
  }
  return i;
}

function matchClose(src: string, open: number, o: string, c: string): number {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(src, i);
      continue;
    }
    if (ch === o) depth++;
    else if (ch === c) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return src.length - 1;
}

function splitTopLevel(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < args.length) {
    const ch = args[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(args, i);
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(args.slice(start, i).trim());
      start = i + 1;
    }
    i++;
  }
  const tail = args.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function blankComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipString(src, i);
      out += src.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      const block = src[i + 1] === "*";
      let stop = block ? src.indexOf("*/", i + 2) : src.indexOf("\n", i);
      stop = stop === -1 ? src.length : block ? stop + 2 : stop;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export function findLogCalls(file: string, rawSrc: string): LogCall[] {
  const src = blankComments(rawSrc);
  const calls: LogCall[] = [];
  const re = /\blogger\.(warn|error)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, open, "(", ")");
    calls.push({
      file,
      level: m[1] as "warn" | "error",
      line: src.slice(0, m.index).split("\n").length,
      args: splitTopLevel(src.slice(open + 1, close)),
    });
  }
  return calls;
}

const ERROR_MESSAGE_READ = /(\(\s*\w+\s+as\s+(?:Error|any|unknown)\s*\)|\b(?:e|err|error|ex|cause)\b)\??\.message\b/;
const ERROR_STRINGIFY = /\bString\(\s*(?:e|err|error|ex)\s*\)/;

export function violations(call: LogCall): string[] {
  const found: string[] = [];
  const [message, ...rest] = call.args;
  if (message && message.startsWith("`") && message.includes("${")) found.push("interpolated message");
  const hasMeta = call.level === "error" ? rest.length >= 2 || rest[0]?.startsWith("{") === true : rest.length > 0;
  if (!hasMeta) found.push("no meta");
  const restText = rest.join(",");
  if (ERROR_MESSAGE_READ.test(restText) || ERROR_MESSAGE_READ.test(message ?? "")) found.push("error .message instead of the Error");
  if (ERROR_STRINGIFY.test(restText)) found.push("String(error) instead of the Error");
  return found;
}

describe("log-call hygiene (api-log-clarity H1-H4)", () => {
  test("detector flags each forbidden shape and passes a clean call", () => {
    const src = [
      "logger.warn(`x ${y}`, { a: 1 });",
      "logger.warn(\"no meta\");",
      "logger.error(\"op failed\", undefined, {\n  error: (e as Error).message,\n});",
      "logger.warn(\"op failed\", { error: String(err) });",
      "logger.warn(\"store: save failed\", { sessionId, error: e });",
      "// logger.warn(`commented ${out}`);",
      "logger.error(\"store: load failed\", e);",
      "logger.error(\"store: load failed\", e, { sessionId });",
    ].join("\n");
    const verdicts = findLogCalls("fixture.ts", src).map((c) => violations(c));
    expect(verdicts).toEqual([
      ["interpolated message"],
      ["no meta"],
      ["error .message instead of the Error"],
      ["String(error) instead of the Error"],
      [],
      ["no meta"],
      [],
    ]);
  });

  test("every production warn/error call passes the Error, a constant message and meta", () => {
    const offenders: string[] = [];
    let population = 0;
    for (const file of productionFiles()) {
      const src = readFileSync(path.join(REPO_ROOT, file), "utf8");
      for (const call of findLogCalls(file, src)) {
        population++;
        const v = violations(call);
        if (v.length > 0) offenders.push(`${call.file}:${call.line} ${v.join(", ")}`);
      }
    }
    expect(population).toBeGreaterThan(200);
    expect(offenders).toEqual([]);
  });
});
