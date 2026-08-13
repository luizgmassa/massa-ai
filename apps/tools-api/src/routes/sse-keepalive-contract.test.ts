/**
 * Regression sensor for the heartbeat-vs-idle-window inequality (spec SSE-03,
 * design D3, tasks.md T3).
 *
 * The defect this sensor exists to catch: the shipped heartbeat (15 000 ms)
 * was scheduled LONGER than the transport's idle window (10 000 ms), so it
 * could never fire before the socket was already dropped (spec E1-E3). Two
 * independent checks pin the inequality so it cannot silently invert again:
 *
 * (a) `resolveHeartbeatMs()`'s DEFAULT (env override cleared) must be
 *     strictly below `TRANSPORT_IDLE_WINDOW_MS`, and a failure names both
 *     values (AC-03.1).
 *
 * (b) Every non-test file under `src/routes/` whose source contains the
 *     literal `text/event-stream` is enumerated from source — never from a
 *     hardcoded list of "the two routes we know about" (design D3: that is
 *     exactly how `events.ts` carried this bug unreported while `logs.ts` was
 *     being hardened separately). The discovered population and its size are
 *     PRINTED before membership is judged, and the size is asserted >= 2
 *     first — a sweep matching zero files must read as a broken sweep, not a
 *     clean pass. Each member must either (i) import the shared
 *     `sse-keepalive.js` resolvers and install no bare numeric literal as a
 *     `setInterval` delay, or (ii) appear in `NO_HEARTBEAT_ROUTES` below with
 *     a non-empty reason string, which the test also prints (AC-03.2).
 *
 * Matching is done with a JavaScript regular expression over file contents
 * read via `node:fs`, deliberately never a shell sweep: this repository's
 * `grep` is `ugrep` honouring `.gitignore`, and its `git grep -E` build drops
 * `\b` — both have produced false-clean sweeps in this codebase before
 * (design D3).
 *
 * AC-03.4 — detection-rule blind spot, stated rather than left implicit: the
 * population above is derived by matching the LITERAL string
 * `text/event-stream` inside each file's source text. A future SSE route that
 * sets its content-type from an IMPORTED CONSTANT (e.g.
 * `"Content-Type": SSE_CONTENT_TYPE_HEADER` instead of the inline string)
 * would never match this regex and would fall outside the discovered
 * population entirely — silently unchecked, not flagged red. This was raised
 * by the Plan Challenge Gate as a narrower recurrence of the very blind spot
 * this sensor exists to close: a sensor that names one instance and hides its
 * siblings. The printed population below is what a reviewer checks by hand
 * against `src/routes/` when this limitation matters.
 *
 * Proved RED twice (transcripts recorded in `validation.md`, AC-03.3):
 *   1. Temporarily restoring `SSE_HEARTBEAT_MS_DEFAULT = 15_000` in
 *      `sse-keepalive.ts` — the (a) test fails, naming 15000 >= 10000.
 *   2. Temporarily adding a scratch SSE route file under `src/routes/` that
 *      declares `"Content-Type": "text/event-stream"` and imports nothing —
 *      the (b) test fails, naming the scratch file as ungoverned.
 * Both mutations were restored by text edit, never `git checkout` (a
 * mutation harness that restores with git can delete uncommitted sibling
 * files — not a risk taken here).
 */

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { TRANSPORT_IDLE_WINDOW_MS, resolveHeartbeatMs } from "./sse-keepalive.js";

const ROUTES_DIR = path.resolve(import.meta.dir);

/** JavaScript regex, not a shell sweep — see the module docblock. */
const SSE_CONTENT_TYPE_RE = /text\/event-stream/;

/**
 * `model-registry-stream.ts` is the known legitimate no-heartbeat SSE route
 * (spec Out of Scope table, design D3 point 3(b)): it pipes a spawned
 * generator's stdout/stderr line-by-line and terminates in seconds, so
 * nothing is ever idle long enough for the transport window to matter.
 * Any OTHER file discovered here without an entry is a sensor failure, not a
 * silent pass — that is the whole point of requiring a reason string.
 */
const NO_HEARTBEAT_ROUTES: Record<string, string> = {
  "model-registry-stream.ts":
    "streams a spawned child process's stdout/stderr line-by-line and terminates in seconds " +
    "(regeneration completes quickly); it never sits idle long enough for the transport idle " +
    "window to matter, so it correctly has no heartbeat (spec Out of Scope table).",
};

/**
 * Recursively collects every non-test `.ts` file under `dir`, so the
 * population survives `src/routes/` ever growing a subdirectory — enumerating
 * from source per design D3, not from a hardcoded list.
 */
function walkNonTestTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkNonTestTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extracts the raw, unparsed argument-list text of every `setInterval(...)`
 * call in `source`, via depth counting over `(){}[]` rather than a regex — a
 * non-greedy regex spanning an arrow-function body with its own nested calls
 * cannot reliably find the call's OWN closing paren, and would either stop
 * too early or run past it into unrelated code.
 */
function extractSetIntervalArgLists(source: string): string[] {
  const marker = "setInterval(";
  const argLists: string[] = [];
  let searchFrom = 0;
  for (;;) {
    const start = source.indexOf(marker, searchFrom);
    if (start === -1) break;
    let depth = 1;
    let i = start + marker.length;
    for (; i < source.length && depth > 0; i++) {
      const ch = source[i];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
    argLists.push(source.slice(start + marker.length, Math.max(start + marker.length, i - 1)));
    searchFrom = i;
  }
  return argLists;
}

/** Splits a call's raw argument-list text on TOP-LEVEL commas only (depth 0
 *  over `(){}[]`), so a numeric literal nested inside another call or object
 *  in an earlier argument is never mistaken for the call's own last, top
 *  -level argument (the delay). */
function splitTopLevelArgs(argListText: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of argListText) {
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  args.push(current);
  return args;
}

const BARE_NUMERIC_LITERAL_RE = /^\d[\d_]*$/;

/** True when any `setInterval` call in `source` passes a bare numeric literal
 *  (e.g. `15_000`, `5000`) as its delay argument instead of a named constant
 *  or a call to a resolver from `sse-keepalive.js` (design D3 point 3(a)). */
function hasBareNumericIntervalLiteral(source: string): boolean {
  return extractSetIntervalArgLists(source).some((argList) => {
    const args = splitTopLevelArgs(argList);
    const last = (args[args.length - 1] ?? "").trim();
    return BARE_NUMERIC_LITERAL_RE.test(last);
  });
}

const IMPORTS_SSE_KEEPALIVE_RE = /from\s+["']\.\/sse-keepalive\.js["']/;

describe("SSE-03 regression sensor", () => {
  test("the default heartbeat is strictly below the transport idle window (AC-03.1)", () => {
    const original = process.env.MASSA_AI_SSE_HEARTBEAT_MS;
    delete process.env.MASSA_AI_SSE_HEARTBEAT_MS;
    try {
      const heartbeat = resolveHeartbeatMs();
      expect(
        heartbeat,
        `resolved heartbeat default is ${heartbeat}ms; TRANSPORT_IDLE_WINDOW_MS is ` +
          `${TRANSPORT_IDLE_WINDOW_MS}ms — the heartbeat MUST be strictly below the idle window, ` +
          `or it can never fire before Bun's transport drops the idle socket (spec E1-E3, SSE-01 AC-01.2).`,
      ).toBeLessThan(TRANSPORT_IDLE_WINDOW_MS);
    } finally {
      if (original === undefined) delete process.env.MASSA_AI_SSE_HEARTBEAT_MS;
      else process.env.MASSA_AI_SSE_HEARTBEAT_MS = original;
    }
  });

  test("every discovered SSE route governs its heartbeat via sse-keepalive.js or is a listed exception (AC-03.2)", () => {
    const allFiles = walkNonTestTsFiles(ROUTES_DIR);
    const population = allFiles
      .filter((full) => SSE_CONTENT_TYPE_RE.test(fs.readFileSync(full, "utf8")))
      .map((full) => path.relative(ROUTES_DIR, full))
      .sort();

    // AC-03.2: print the population before judging membership.
    console.log(
      `[SSE-03] discovered ${population.length} route file(s) containing "text/event-stream" ` +
        `under ${path.relative(process.cwd(), ROUTES_DIR)}: ${JSON.stringify(population)}`,
    );

    // Assert the population size BEFORE judging membership — a sweep that
    // matches nothing must read as a broken sweep, not a clean pass.
    expect(
      population.length,
      `discovered SSE-route population is ${JSON.stringify(population)} (size ${population.length}) — ` +
        `fewer than 2 means the source-derived sweep itself is broken (it found neither logs.ts nor ` +
        `events.ts), not that the codebase has no SSE routes to govern.`,
    ).toBeGreaterThanOrEqual(2);

    for (const rel of population) {
      const full = path.join(ROUTES_DIR, rel);
      const source = fs.readFileSync(full, "utf8");
      const reason = NO_HEARTBEAT_ROUTES[rel];

      if (reason !== undefined) {
        // AC-03.2: print the reason a listed exception is exempt.
        console.log(`[SSE-03] ${rel}: NO_HEARTBEAT_ROUTES — ${reason}`);
        expect(
          reason.trim().length,
          `NO_HEARTBEAT_ROUTES["${rel}"] must carry a non-empty reason string a reviewer can falsify — ` +
            `a silent skip is not a claim.`,
        ).toBeGreaterThan(0);
        continue;
      }

      const importsKeepalive = IMPORTS_SSE_KEEPALIVE_RE.test(source);
      expect(
        importsKeepalive,
        `${rel} contains "text/event-stream" but neither imports the shared resolvers from ` +
          `"./sse-keepalive.js" nor appears in NO_HEARTBEAT_ROUTES with a reason (AC-03.2). It must ` +
          `call resolveHeartbeatMs()/resolveMaxDurationMs() instead of declaring its own literal, or ` +
          `be listed here as a deliberate no-heartbeat route.`,
      ).toBe(true);

      expect(
        hasBareNumericIntervalLiteral(source),
        `${rel} imports sse-keepalive.js but still passes a bare numeric literal as a setInterval ` +
          `delay instead of a resolver-derived value — this is exactly how the 15_000ms literal ` +
          `re-inverted the inequality once already (design D3 point 3(a)).`,
      ).toBe(false);
    }
  });
});
