#!/usr/bin/env bun
/**
 * Deterministic bookkeeping for the massa-ai spec-driven lessons layer.
 *
 * The LLM supplies judgment (which failure happened, how to phrase the lesson, what
 * signal grounds it). This script owns everything mechanical: IDs, distinct-feature
 * recurrence counting, candidate->confirmed promotion, pruning, demotion. Bookkeeping
 * by hand is exactly what rots a lessons file, so it lives here, not in a prompt.
 *
 * Canonical state:  .specs/lessons.json   (machine-owned - do NOT hand-edit)
 *
 * Bun builtins only. No new dependencies. Pass --root with the target workspace
 * root so the package-local script writes that workspace's .specs directory.
 *
 * Commands:
 *   add        Record a grounded lesson from a verification signal.
 *   list       Print lessons (default: confirmed) for loading at Specify/Design.
 *   penalize   Mark a confirmed lesson as having failed when applied (-> quarantine).
 *   prune      Drop stale uncorroborated candidates (also runs automatically on add/list).
 *   status     Print counts (used by the self-check in validate.md).
 *   init       Create empty store.
 *   observe    Ingest a JSON observation into the gitignored observations buffer.
 *   export     Export the lessons store as JSON (round-trips with import).
 *   import     Import lessons from JSON (merge by dedup key; best-effort massa-ai memory).
 *   selftest   Run stdlib regressions (normalization).
 *
 * Exit codes: 0 ok, 2 usage/validation error (e.g. missing grounding).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const STORE_REL = join(".specs", "lessons.json");
const OBS_REL = join(".specs", "observations.json");

const SIGNALS: Record<string, string> = {
  ac_gap: "Acceptance criterion not covered / failed",
  surviving_mutant: "Discrimination sensor mutant survived (weak test)",
  spec_precision_gap: "Spec did not define a precise outcome",
  spec_deviation: "Implementation diverged from spec/design (SPEC_DEVIATION)",
  gate_fail: "Build-level gate check failed",
};
const SIGNAL_KEYS_SORTED = Object.keys(SIGNALS).sort();

const DEFAULTS = { promote_threshold: 2, window_days: 45, quarantine_threshold: 2 };

// massa-ai supported memory types (references/mcp-tools.md). `procedural` is a
// TAG, never a type. Lessons are procedural knowledge -> type `pattern`.
const MASSA_AI_LESSON_TYPE = "pattern";

interface Lesson {
  id: string;
  key: string;
  text: string;
  signal: string;
  scope: string;
  status: "candidate" | "confirmed" | "quarantined";
  features: string[];
  recurrence: number;
  harmful: number;
  evidence: string[];
  created: string;
  last_seen: string;
  confidence?: number;
  project?: string;
  session?: string;
  workflow?: string;
  entity?: string;
  [key: string]: unknown;
}

interface Store {
  schema: number;
  promote_threshold: number;
  window_days: number;
  quarantine_threshold: number;
  next_id: number;
  lessons: Lesson[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Python-parity helpers
// ---------------------------------------------------------------------------

function now(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

function parseDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(s);
  if (!m) return new Date();
  const [, y, mo, da, h, mi, se] = m;
  const d = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(se)));
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
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

/** Mirrors Python's `str(list_of_strings)` (a list repr: ['a', 'b']). */
function pyListRepr(items: string[]): string {
  return `[${items.map(pyRepr).join(", ")}]`;
}

/**
 * Exact rational (numerator/denominator) value of a finite, non-zero IEEE 754
 * double, derived from its bit pattern (mantissa/exponent).
 */
function doubleToExactFraction(x: number): { numerator: bigint; denominator: bigint } {
  const buf = new ArrayBuffer(8);
  new Float64Array(buf)[0] = x;
  const bits = new BigUint64Array(buf)[0]!;
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  const mantissaBits = bits & 0xfffffffffffffn;
  let mantissa: bigint;
  let expPow: bigint;
  if (exponentBits === 0) {
    // subnormal
    mantissa = mantissaBits;
    expPow = -1074n;
  } else {
    mantissa = mantissaBits | (1n << 52n);
    expPow = BigInt(exponentBits) - 1075n;
  }
  let numerator = mantissa;
  let denominator = 1n;
  if (expPow >= 0n) {
    numerator <<= expPow;
  } else {
    denominator <<= -expPow;
  }
  return { numerator, denominator };
}

/**
 * Mirrors Python's round(x, 2) for floats: correctly-rounded to 2 decimal
 * places based on the EXACT binary value of the double, ties-to-even
 * (banker's rounding). A naive `Math.round(x * 100) / 100` gets the
 * reachable 0.625 confidence-boundary case wrong (0.63 instead of 0.62) -
 * see design D4 / Plan Challenge F1.
 */
function roundHalfEven2(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const neg = x < 0;
  const ax = Math.abs(x);
  const { numerator, denominator } = doubleToExactFraction(ax);
  const scaledNum = numerator * 100n;
  const q = scaledNum / denominator;
  const r = scaledNum % denominator;
  const twiceR = r * 2n;
  let roundedInt: bigint;
  if (twiceR < denominator) {
    roundedInt = q;
  } else if (twiceR > denominator) {
    roundedInt = q + 1n;
  } else {
    roundedInt = q % 2n === 0n ? q : q + 1n;
  }
  const result = Number(roundedInt) / 100;
  return neg ? -result : result;
}

/**
 * Mirrors Python's str(float): a whole-number float still prints its
 * trailing ".0" (Python's round() always returns a float, so a confidence
 * of exactly 1.0 or 0.0 prints "1.0"/"0.0", not "1"/"0" - JS numbers have no
 * int/float distinction and collapse this by default.
 */
function pyFloatStr(x: number): string {
  return Number.isInteger(x) ? `${x}.0` : String(x);
}

/**
 * Mirrors Python's json.dump for a store/export object containing a
 * `confidence` float field: JSON.stringify collapses a whole-number float
 * (1.0 -> "1") the same way string interpolation does. `confidence` is the
 * only float-typed field this store ever writes; every other numeric field
 * (schema, next_id, recurrence, harmful, promote_threshold, window_days,
 * quarantine_threshold) is always a Python int and needs no fixup.
 */
function pyJsonStringify(data: unknown): string {
  const text = JSON.stringify(data, null, 2);
  return text.replace(/("confidence": )(-?\d+)([,\n])/g, (_m, prefix: string, num: string, suffix: string) => `${prefix}${num}.0${suffix}`);
}

function pySetDefault<T extends Record<string, unknown>>(obj: T, key: string, value: unknown): void {
  if (!(key in obj)) {
    (obj as Record<string, unknown>)[key] = value;
  }
}

function pyStringCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Store I/O
// ---------------------------------------------------------------------------

function storePath(root: string): string {
  return join(root, STORE_REL);
}

function load(root: string): Store {
  const path = storePath(root);
  if (!existsSync(path)) {
    return {
      schema: 1,
      promote_threshold: DEFAULTS.promote_threshold,
      window_days: DEFAULTS.window_days,
      quarantine_threshold: DEFAULTS.quarantine_threshold,
      next_id: 1,
      lessons: [],
    };
  }
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as Store;
  for (const [k, v] of Object.entries(DEFAULTS)) {
    pySetDefault(data as unknown as Record<string, unknown>, k, v);
  }
  pySetDefault(data as unknown as Record<string, unknown>, "schema", 1);
  pySetDefault(data as unknown as Record<string, unknown>, "next_id", 1);
  pySetDefault(data as unknown as Record<string, unknown>, "lessons", []);
  return data;
}

function save(root: string, data: Store): void {
  mkdirSync(join(root, ".specs"), { recursive: true });
  writeFileSync(storePath(root), `${pyJsonStringify(data)}\n`, "utf-8");
}

function confidence(lesson: Lesson, data: Store): number {
  const recurrence = lesson.recurrence ?? 1;
  const recCap = Math.min(recurrence / Math.max(data.promote_threshold, 1), 1.0);
  const sigWeight = 0.15;
  const scopeWeight = lesson.scope ? 0.1 : 0.0;
  return roundHalfEven2(Math.min(recCap * 0.75 + sigWeight + scopeWeight, 1.0));
}

function obsPath(root: string): string {
  return join(root, OBS_REL);
}

function obsLoad(root: string): unknown[] {
  const path = obsPath(root);
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function obsAppend(root: string, item: unknown): void {
  mkdirSync(join(root, ".specs"), { recursive: true });
  const items = obsLoad(root);
  items.push(item);
  writeFileSync(obsPath(root), `${JSON.stringify(items, null, 2)}\n`, "utf-8");
}

/**
 * Best-effort massa-ai memory write via REST (fetch, Bun builtin only).
 *
 * massa-ai MCP is agent-side only; a CLI subprocess cannot call MCP. massa-ai exposes
 * REST at MASSA_AI_API_URL. Type is always `pattern` (lessons are procedural
 * knowledge); `procedural` is a tag, not a type. Returns true on success,
 * false (silent) when unavailable - the file store remains source of truth.
 * Its failure must never change exit codes or stdout contract.
 */
async function rememberBestEffort(
  content: string,
  tags: string[],
  projectId = "",
  sessionId = "",
): Promise<boolean> {
  const apiUrl = process.env.MASSA_AI_API_URL;
  if (!apiUrl) return false;
  const path = process.env.MASSA_AI_MEMORY_PATH || "/api/v1/memory";
  const url = apiUrl.replace(/\/+$/, "") + path;
  const body = JSON.stringify({
    content,
    type: MASSA_AI_LESSON_TYPE,
    importance: 0.6,
    projectId,
    sessionId,
    tags,
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.MASSA_AI_API_KEY;
  if (key) headers["x-api-key"] = key;
  try {
    const resp = await fetch(url, {
      method: "POST",
      body,
      headers,
      signal: AbortSignal.timeout(1500),
    });
    return resp.status >= 200 && resp.status < 300;
  } catch {
    return false;
  }
}

/** massa-ai persistence tag contract for a lesson's massa-ai memory. */
function lessonTags(lesson: Lesson): string[] {
  return [
    `project:${lesson.project || ""}`,
    `session:${lesson.session || ""}`,
    `workflow:${lesson.workflow || "unset"}`,
    `entity:${lesson.entity || "unset"}`,
    "memory:procedural",
  ];
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

// Approximates Python's isalnum()-or-isspace() per-codepoint filter: Unicode
// Letter/Number categories plus whitespace. Known dialect risk (D4): Python's
// str.casefold() vs JS's toLowerCase() diverge on ß/ſ-class codepoints - the
// live-key dual-run (all 15 .specs/lessons.json keys) is the sensor; none of
// them reach that class as of this port.
const ALNUM_OR_SPACE_RE = /[\p{L}\p{N}\s]/u;

/**
 * Normalized dedup key for lesson text.
 *
 * - casefold (approximated by toLowerCase()) + NFD, strip combining marks (so
 *   Portuguese diacritics match ASCII peers)
 * - keep characters where Unicode Letter/Number or whitespace (any script)
 * - drop other punctuation, collapse whitespace
 *
 * Exact-after-normalization only - no semantic matching (this is a direct
 * behavioral port of the stdlib-only Python original).
 */
export function norm(text: string): string {
  let t = text.toLowerCase();
  t = t.normalize("NFD");
  t = t.replace(/\p{Mn}/gu, "");
  const chars = Array.from(t);
  t = chars.map((c) => (ALNUM_OR_SPACE_RE.test(c) ? c : " ")).join("");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function selftestNorm(): number {
  const failures: string[] = [];
  const check = (cond: boolean, msg: string) => {
    if (!cond) failures.push(msg);
  };

  const a = norm("Não use datas locais");
  const b = norm("Nao use datas locais");
  check(a === b && b === "nao use datas locais", `PT diacritics: ${pyRepr(a)} vs ${pyRepr(b)}`);

  const jp1 = norm("日本語の文です");
  const jp2 = norm("別の日本語文");
  check(jp1 !== "", `JP1 empty: ${pyRepr(jp1)}`);
  check(jp2 !== "", `JP2 empty: ${pyRepr(jp2)}`);
  check(jp1 !== jp2, `JP sentences collapsed: ${pyRepr(jp1)} == ${pyRepr(jp2)}`);

  const cafe1 = norm("café");
  const cafe2 = norm("cafe");
  check(cafe1 === cafe2 && cafe2 === "cafe", `cafe: ${pyRepr(cafe1)}`);

  if (failures.length) {
    for (const f of failures) console.error(`FAIL: ${f}`);
    return 1;
  }
  console.log("selftest_norm: ok");
  return 0;
}

function keyOf(signal: string, text: string): string {
  return `${signal}::${norm(text)}`;
}

/** Drop candidates that never recurred within the window. Mutates data. */
function autoPrune(data: Store): string[] {
  const threshold = data.promote_threshold;
  const window = data.window_days;
  const nowMs = Date.now();
  const kept: Lesson[] = [];
  const dropped: string[] = [];
  for (const l of data.lessons) {
    if (l.status === "candidate" && l.recurrence < threshold) {
      const lastSeen = l.last_seen ?? l.created ?? now();
      const ageDays = Math.floor((nowMs - parseDate(lastSeen).getTime()) / 86400000);
      if (ageDays > window) {
        dropped.push(l.id);
        continue;
      }
    }
    kept.push(l);
  }
  data.lessons = kept;
  return dropped;
}

function find(data: Store, signal: string, text: string): Lesson | null {
  const k = keyOf(signal, text);
  for (const l of data.lessons) {
    if (l.key === k) return l;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdInit(root: string): number {
  const data = load(root);
  save(root, data);
  console.log(`Initialized lessons store at ${storePath(root)}`);
  return 0;
}

interface AddArgs {
  feature: string;
  signal: string;
  source: string;
  text: string;
  scope: string;
  project: string;
  session: string;
  workflow: string;
  entity: string;
}

async function cmdAdd(root: string, args: AddArgs): Promise<number> {
  const signal = args.signal;
  const source = (args.source || "").trim();
  const text = (args.text || "").trim();
  const feature = (args.feature || "").trim();

  // Grounding is enforced here, deterministically - not left to the prompt.
  if (!(signal in SIGNALS)) {
    console.error(`ERROR: --signal must be one of ${pyListRepr(SIGNAL_KEYS_SORTED)}`);
    return 2;
  }
  if (!feature) {
    console.error("ERROR: --feature is required (the feature the signal came from).");
    return 2;
  }
  if (!source) {
    console.error("ERROR: --source is required (file:line / AC id / mutant id / SPEC_DEVIATION ref).");
    console.error("       A lesson with no grounding in validation.md is an opinion, not a lesson. Refused.");
    return 2;
  }
  if (text.length < 12) {
    console.error("ERROR: --text too short. State the actionable lesson in one terse sentence.");
    return 2;
  }

  const data = load(root);
  autoPrune(data);
  const existing = find(data, signal, text);
  const nowStr = now();
  const project = (args.project || "").trim();
  const session = (args.session || "").trim();
  const workflow = (args.workflow || "").trim();
  const entity = (args.entity || "").trim();

  const applyCtx = (lesson: Lesson) => {
    if (project) lesson.project = project;
    if (session) lesson.session = session;
    if (workflow) lesson.workflow = workflow;
    if (entity) lesson.entity = entity;
  };

  if (existing) {
    if (!existing.features.includes(feature)) {
      existing.features.push(feature);
    }
    existing.recurrence = existing.features.length;
    existing.last_seen = nowStr;
    applyCtx(existing);
    existing.confidence = confidence(existing, data);
    const ev = args.scope ? `${source} (${args.scope})` : source;
    if (!existing.evidence.includes(ev)) {
      existing.evidence.push(ev);
    }
    let promoted = false;
    if (existing.status === "candidate" && existing.recurrence >= data.promote_threshold) {
      existing.status = "confirmed";
      promoted = true;
    }
    save(root, data);
    await rememberBestEffort(`${existing.id} [${signal}] ${text}`, lessonTags(existing), project, session);
    let msg = `UPDATED ${existing.id} (recurrence=${existing.recurrence}, status=${existing.status}, confidence=${pyFloatStr(existing.confidence!)})`;
    if (promoted) msg += " - PROMOTED to confirmed";
    console.log(msg);
  } else {
    const lid = `L-${String(data.next_id).padStart(3, "0")}`;
    data.next_id += 1;
    const lesson: Lesson = {
      id: lid,
      key: keyOf(signal, text),
      text,
      signal,
      scope: (args.scope || "").trim(),
      status: "candidate",
      features: [feature],
      recurrence: 1,
      harmful: 0,
      evidence: [args.scope ? `${source} (${args.scope})` : source],
      created: nowStr,
      last_seen: nowStr,
    };
    applyCtx(lesson);
    lesson.confidence = confidence(lesson, data);
    data.lessons.push(lesson);
    save(root, data);
    await rememberBestEffort(`${lid} [${signal}] ${text}`, lessonTags(lesson), project, session);
    console.log(`ADDED ${lid} (status=candidate, recurrence=1, confidence=${pyFloatStr(lesson.confidence!)})`);
  }
  return 0;
}

function cmdPenalize(root: string, id: string): number {
  const data = load(root);
  let target: Lesson | null = null;
  for (const l of data.lessons) {
    if (l.id.toLowerCase() === id.toLowerCase()) {
      target = l;
      break;
    }
  }
  if (!target) {
    console.error(`ERROR: no lesson with id ${id}`);
    return 2;
  }
  target.harmful = (target.harmful ?? 0) + 1;
  target.last_seen = now();
  if (target.harmful >= data.quarantine_threshold) {
    target.status = "quarantined";
  }
  save(root, data);
  console.log(`PENALIZED ${target.id} (harmful=${target.harmful}, status=${target.status})`);
  return 0;
}

interface ListArgs {
  status: string;
  query: string;
  scope: string;
  project: string;
}

function cmdList(root: string, args: ListArgs): number {
  const data = load(root);
  if (autoPrune(data).length) {
    save(root, data);
  }
  const want = args.status;
  const q = (args.query || "").toLowerCase().trim();
  const scope = (args.scope || "").toLowerCase().trim();
  const project = (args.project || "").toLowerCase().trim();
  const rows: Lesson[] = [];
  for (const l of data.lessons) {
    if (want !== "all" && l.status !== want) continue;
    if (q && !l.text.toLowerCase().includes(q)) continue;
    if (scope && !(l.scope || "").toLowerCase().includes(scope)) continue;
    if (project && !(l.project || "").toLowerCase().includes(project)) continue;
    rows.push(l);
  }
  if (!rows.length) {
    const flt = [q, scope, project].filter((f) => f).join(" ");
    console.log(`(no ${want} lessons` + (flt ? ` matching '${flt}'` : "") + ")");
    return 0;
  }
  const sorted = [...rows].sort((x, y) => pyStringCompare(x.id, y.id));
  for (const l of sorted) {
    const sc = l.scope ? ` [scope:${l.scope}]` : "";
    const conf = l.confidence ?? confidence(l, data);
    console.log(`${l.id} (${l.status}, x${l.recurrence}, conf=${pyFloatStr(conf)})${sc}: ${l.text}`);
  }
  return 0;
}

/**
 * Ingest a JSON observation into the gitignored observations buffer.
 *
 * Grounding is NOT enforced here; it is enforced when `add` consumes the
 * buffer. Observation fields: signal, text, source, feature, scope, project,
 * session, workflow, entity.
 */
function cmdObserve(root: string, jsonArg: string): number {
  const raw = jsonArg ? jsonArg : readFileSync(0, "utf-8");
  let item: unknown;
  try {
    item = JSON.parse(raw);
  } catch (exc) {
    console.error(`ERROR: observation is not valid JSON: ${exc instanceof Error ? exc.message : String(exc)}`);
    return 2;
  }
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    console.error("ERROR: observation must be a JSON object");
    return 2;
  }
  pySetDefault(item as Record<string, unknown>, "observed_at", now());
  obsAppend(root, item);
  console.log(`OBSERVED buffer=1 (total=${obsLoad(root).length})`);
  return 0;
}

/** Export the lessons store as JSON (stdout or --out). Round-trips with import. */
function cmdExport(root: string, out: string): number {
  const data = load(root);
  const text = `${pyJsonStringify(data)}\n`;
  if (out) {
    writeFileSync(out, text, "utf-8");
    console.log(`EXPORTED ${data.lessons.length} lessons -> ${out}`);
  } else {
    process.stdout.write(text);
  }
  return 0;
}

/**
 * Import lessons from JSON (stdin or --in), merging by dedup key.
 *
 * Re-emits massa-ai memory best-effort (type `pattern`, tag `memory:procedural`)
 * for each imported lesson so the file store and massa-ai memory stay consistent.
 */
async function cmdImport(root: string, inPath: string | null): Promise<number> {
  const raw = inPath === null ? readFileSync(0, "utf-8") : readFileSync(inPath, "utf-8");
  let incoming: unknown;
  try {
    incoming = JSON.parse(raw);
  } catch (exc) {
    console.error(`ERROR: import payload is not valid JSON: ${exc instanceof Error ? exc.message : String(exc)}`);
    return 2;
  }
  if (
    typeof incoming !== "object" ||
    incoming === null ||
    !Array.isArray((incoming as Record<string, unknown>).lessons)
  ) {
    console.error("ERROR: import payload must be a lessons store object with `lessons`");
    return 2;
  }
  const data = load(root);
  autoPrune(data);
  const nowStr = now();
  let added = 0;
  let merged = 0;
  const incomingLessons = (incoming as { lessons: Record<string, unknown>[] }).lessons;
  for (const l of incomingLessons) {
    const key = (l.key as string) || keyOf((l.signal as string) || "", (l.text as string) || "");
    const existing = data.lessons.find((x) => x.key === key) ?? null;
    if (existing) {
      const incomingFeatures = Array.isArray(l.features) ? (l.features as string[]) : [];
      for (const f of incomingFeatures) {
        if (!existing.features.includes(f)) existing.features.push(f);
      }
      existing.recurrence = existing.features.length;
      existing.last_seen = nowStr;
      existing.confidence = confidence(existing, data);
      merged += 1;
    } else {
      const lid = `L-${String(data.next_id).padStart(3, "0")}`;
      data.next_id += 1;
      pySetDefault(l, "id", lid);
      l.id = lid;
      l.key = key;
      pySetDefault(l, "status", "candidate");
      const featLen = Array.isArray(l.features) ? (l.features as unknown[]).length : 0;
      pySetDefault(l, "recurrence", featLen || 1);
      pySetDefault(l, "harmful", 0);
      pySetDefault(l, "created", nowStr);
      l.last_seen = nowStr;
      (l as unknown as Lesson).confidence = confidence(l as unknown as Lesson, data);
      data.lessons.push(l as unknown as Lesson);
      added += 1;
    }
    const target = (existing ?? (l as unknown as Lesson)) as Lesson;
    await rememberBestEffort(
      `${target.id ?? ""} [${target.signal ?? ""}] ${target.text ?? ""}`,
      lessonTags(target),
      (target.project as string) || "",
      (target.session as string) || "",
    );
  }
  save(root, data);
  console.log(`IMPORTED added=${added} merged=${merged} massa-ai=best-effort`);
  return 0;
}

function cmdPrune(root: string): number {
  const data = load(root);
  const dropped = autoPrune(data);
  save(root, data);
  console.log(`Pruned ${dropped.length} stale candidate(s): ${dropped.length ? dropped.join(", ") : "-"}`);
  return 0;
}

function cmdStatus(root: string): number {
  const data = load(root);
  const counts: Record<string, number> = { confirmed: 0, candidate: 0, quarantined: 0 };
  for (const l of data.lessons) {
    counts[l.status] = (counts[l.status] ?? 0) + 1;
  }
  const total = data.lessons.length;
  console.log(
    `lessons: ${total} total | confirmed=${counts.confirmed} candidate=${counts.candidate} quarantined=${counts.quarantined}`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const PROG = "lessons.ts";

function usageError(msg: string): void {
  process.stderr.write(`usage: ${PROG} [-h] [--root ROOT] {init,add,penalize,list,observe,export,import,prune,status,selftest} ...\n${PROG}: error: ${msg}\n`);
}

interface FlagSpec {
  name: string; // "--feature"
  required?: boolean;
  default?: string;
  choices?: string[];
}

function parseFlags(rest: string[], specs: FlagSpec[]): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const spec of specs) {
    if (spec.default !== undefined) result[spec.name.slice(2)] = spec.default;
  }
  const specByName = new Map(specs.map((s) => [s.name, s]));
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    let flagName = a;
    let inlineValue: string | undefined;
    if (a.startsWith("--")) {
      const eqIdx = a.indexOf("=");
      if (eqIdx !== -1) {
        flagName = a.slice(0, eqIdx);
        inlineValue = a.slice(eqIdx + 1);
      }
    }
    const spec = specByName.get(flagName);
    if (!spec) {
      usageError(`unrecognized arguments: ${a}`);
      return null;
    }
    let value: string;
    if (inlineValue !== undefined) {
      value = inlineValue;
    } else {
      if (i + 1 >= rest.length) {
        usageError(`argument ${flagName}: expected one argument`);
        return null;
      }
      value = rest[++i]!;
    }
    if (spec.choices && !spec.choices.includes(value)) {
      usageError(`argument ${flagName}: invalid choice: ${pyRepr(value)} (choose from ${spec.choices.map(pyRepr).join(", ")})`);
      return null;
    }
    result[spec.name.slice(2)] = value;
  }
  for (const spec of specs) {
    if (spec.required && result[spec.name.slice(2)] === undefined) {
      usageError(`the following arguments are required: ${spec.name}`);
      return null;
    }
  }
  return result;
}

async function main(argv: string[]): Promise<number> {
  let root = ".";
  let i = 0;
  while (i < argv.length) {
    const a = argv[i]!;
    if (a === "--root") {
      if (i + 1 >= argv.length) {
        usageError("argument --root: expected one argument");
        return 2;
      }
      root = argv[i + 1]!;
      i += 2;
      continue;
    }
    if (a.startsWith("--root=")) {
      root = a.slice("--root=".length);
      i += 1;
      continue;
    }
    break;
  }
  if (i >= argv.length) {
    usageError("the following arguments are required: cmd");
    return 2;
  }
  const cmd = argv[i]!;
  const rest = argv.slice(i + 1);
  const absRoot = resolve(root);

  switch (cmd) {
    case "init":
      return cmdInit(absRoot);

    case "add": {
      const parsed = parseFlags(rest, [
        { name: "--feature", required: true },
        { name: "--signal", required: true, choices: SIGNAL_KEYS_SORTED },
        { name: "--source", required: true },
        { name: "--text", required: true },
        { name: "--scope", default: "" },
        { name: "--project", default: "" },
        { name: "--session", default: "" },
        { name: "--workflow", default: "" },
        { name: "--entity", default: "" },
      ]);
      if (!parsed) return 2;
      return cmdAdd(absRoot, parsed as unknown as AddArgs);
    }

    case "penalize": {
      const parsed = parseFlags(rest, [{ name: "--id", required: true }]);
      if (!parsed) return 2;
      return cmdPenalize(absRoot, parsed.id!);
    }

    case "list": {
      const parsed = parseFlags(rest, [
        { name: "--status", default: "confirmed", choices: ["confirmed", "candidate", "quarantined", "all"] },
        { name: "--query", default: "" },
        { name: "--scope", default: "" },
        { name: "--project", default: "" },
      ]);
      if (!parsed) return 2;
      return cmdList(absRoot, parsed as unknown as ListArgs);
    }

    case "observe": {
      const parsed = parseFlags(rest, [{ name: "--json", default: "" }]);
      if (!parsed) return 2;
      return cmdObserve(absRoot, parsed.json!);
    }

    case "export": {
      const parsed = parseFlags(rest, [{ name: "--out", default: "" }]);
      if (!parsed) return 2;
      return cmdExport(absRoot, parsed.out!);
    }

    case "import": {
      const parsed = parseFlags(rest, [{ name: "--in", default: "" }]);
      if (!parsed) return 2;
      return cmdImport(absRoot, parsed.in ? parsed.in : null);
    }

    case "prune":
      return cmdPrune(absRoot);

    case "status":
      return cmdStatus(absRoot);

    case "selftest":
      return selftestNorm();

    default:
      usageError(
        `argument cmd: invalid choice: ${pyRepr(cmd)} (choose from 'init', 'add', 'penalize', 'list', 'observe', 'export', 'import', 'prune', 'status', 'selftest')`,
      );
      return 2;
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
