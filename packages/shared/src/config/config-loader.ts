import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { MassaAiConfig, defaultMassaAiConfig } from "./massa-ai-config";
import { configDir } from "./xdg";

const CONFIG_DIR = configDir("massa-ai");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/**
 * Thrown by {@link readRawConfigStrict} when `config.json` exists but is not
 * parseable JSON, or parses to something other than a plain object. Named so
 * a caller can `err.name === "ConfigParseError"` without a message-string
 * match, and its message names both the file and the underlying parse
 * failure (BST-10).
 */
export class ConfigParseError extends Error {
  constructor(filePath: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to parse ${filePath}: ${reason}`);
    this.name = "ConfigParseError";
  }
}

/**
 * Thrown by {@link writeRawConfig} when the file changed on disk twice in a
 * row around one write attempt: once between the caller's read and this
 * call (handled by re-applying the caller's change onto the fresh document,
 * see {@link writeRawConfig}), and again between that re-apply and the
 * second, immediately-pre-write read. A second race within the same write
 * call is refused rather than silently retried again, so a write can never
 * clobber a concurrent update it never saw.
 */
export class ConfigWriteConflictError extends Error {
  constructor(filePath: string) {
    super(
      `${filePath} changed on disk twice while writing — refusing to overwrite a ` +
        `concurrent update. Re-read the file and retry.`,
    );
    this.name = "ConfigWriteConflictError";
  }
}

/** Raw file contents, or `""` if the file does not exist. Never throws on a
 *  missing file — only a real I/O error other than ENOENT propagates. */
function readConfigFileOrEmpty(): string {
  try {
    return fs.readFileSync(CONFIG_FILE, "utf-8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

type SchedulerSection = NonNullable<MassaAiConfig["scheduler"]>;
type SchedulerJobs = NonNullable<SchedulerSection["jobs"]>;

/** Merges each registered job row over a base row, so a partial row keeps the
 *  fields it did not name. Unknown keys in `incoming` are ignored — the
 *  registered kinds are the contract. */
function mergeSchedulerJobs(
  base: SchedulerJobs | undefined,
  incoming: SchedulerJobs | undefined,
): SchedulerJobs {
  const defaults = defaultMassaAiConfig.scheduler?.jobs ?? {};
  const merged: SchedulerJobs = {};
  for (const kind of Object.keys(defaults) as Array<keyof SchedulerJobs>) {
    merged[kind] = { ...defaults[kind], ...base?.[kind], ...incoming?.[kind] };
  }
  return merged;
}

/**
 * Merges a scheduler section over a base one, one level deeper than a spread.
 *
 * Shared by `loadConfig` (defaults ← config.json) and `savePartialConfig`
 * (stored ← submitted), and it has to be both places. `savePartialConfig`
 * replaces a top-level section wholesale, so a submission naming only
 * `{"enabled": true}` would erase `tickMs`, `maxConcurrent` and all five job
 * rows from config.json — silently discarding any non-default interval the
 * user had set. It also made every scheduler save report a restart as needed,
 * because the stored value it was compared against had been filled in by
 * `loadConfig` and the freshly-written one had not.
 */
export function mergeSchedulerSection(
  base: SchedulerSection | undefined,
  incoming: SchedulerSection | undefined,
): SchedulerSection {
  return {
    ...defaultMassaAiConfig.scheduler,
    ...base,
    ...incoming,
    jobs: mergeSchedulerJobs(base?.jobs, incoming?.jobs),
  };
}

export function loadConfig(): MassaAiConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return defaultMassaAiConfig;
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    const userConfig = JSON.parse(content);

    return {
      ...defaultMassaAiConfig,
      ...userConfig,
      database: { ...defaultMassaAiConfig.database, ...userConfig.database },
      embedding: { ...defaultMassaAiConfig.embedding, ...userConfig.embedding },
      compression: { ...defaultMassaAiConfig.compression, ...userConfig.compression },
      cache: { ...defaultMassaAiConfig.cache, ...userConfig.cache },
      logging: { ...defaultMassaAiConfig.logging, ...userConfig.logging },
      search: { ...defaultMassaAiConfig.search, ...userConfig.search },
      llm: { ...defaultMassaAiConfig.llm, ...userConfig.llm },
      memory: { ...defaultMassaAiConfig.memory, ...userConfig.memory },
      hooks: { ...defaultMassaAiConfig.hooks, ...userConfig.hooks },
      handoffs: { ...defaultMassaAiConfig.handoffs, ...userConfig.handoffs },
      security: { ...defaultMassaAiConfig.security, ...userConfig.security },
      // Needs a merge level of its own: a config.json carrying only
      // `{"scheduler":{"enabled":true}}` would otherwise drop tickMs,
      // maxConcurrent and all five job rows through the `...userConfig`
      // spread, and the Admin Portal would render a Scheduler tab with one
      // field on it.
      scheduler: mergeSchedulerSection(undefined, userConfig.scheduler),
      // Deliberately NOT merged: a rule list is ordered and first-match-wins,
      // so merging a user's rules with the defaults would silently reorder
      // their policy. A configured block replaces the default wholesale.
      capturePolicy: userConfig.capturePolicy ?? defaultMassaAiConfig.capturePolicy,
    };
  } catch (error) {
    console.error(`Error loading config from ${CONFIG_FILE}:`, error);
    return defaultMassaAiConfig;
  }
}

/**
 * The literal contents of `config.json`, with NO defaults merged in — an absent
 * file, an absent section and an absent field all stay `undefined`.
 *
 * This exists because {@link loadConfig} answers a different question. Its job
 * is "what is the effective configuration", so it folds `defaultMassaAiConfig`
 * in and never returns an absent section; that is what the Admin Portal needs,
 * and it is why every one of its sections renders. But a caller resolving
 * `env > config.json > its own fallback` needs the middle layer to be able to
 * say *nothing* — otherwise `fileValue ?? fallback` always stops at the merged
 * default and the caller's own fallback becomes dead code.
 *
 * `scheduler-defaults.ts` is exactly that caller, and it is why this function
 * exists: its safe-defaults preset supplies `defaultEnabled: true` as the
 * fallback layer, and folding the default `enabled: false` in as the "file"
 * layer silently disabled the preset. Its docblock had already named the
 * hazard for `config.get("scheduler")`; the defect arrived through
 * `loadConfigSafe()` instead, which is the same hazard through a second door.
 * A user's explicit `false` in config.json must still win over the preset —
 * only the *default* must not — which is precisely the distinction a raw read
 * preserves and a merged read destroys.
 *
 * Never throws: a missing file, unreadable file or malformed JSON all return an
 * empty object, matching {@link loadConfigSafe}'s contract for a layer that
 * must never abort startup.
 */
export function loadRawUserConfig(): Partial<MassaAiConfig> {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    // A JSON scalar or array parses fine but is not a config object; treating
    // it as one would hand callers `.scheduler` off a string.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Partial<MassaAiConfig>;
  } catch {
    return {};
  }
}

/**
 * The literal parsed contents of `config.json`, with NO defaults merged in and
 * NO catch-and-degrade on a parse failure — the opposite tradeoff from both
 * {@link loadConfig} (defaults merged, swallows a parse failure) and
 * {@link loadRawUserConfig} (raw, but also swallows a parse failure).
 *
 * This exists for a caller that must never silently treat "malformed" as
 * "empty". {@link loadConfig} catches `JSON.parse` failures, logs to
 * `console.error`, and returns {@link defaultMassaAiConfig} (`:99-102`
 * above); composed with {@link saveConfig}'s whole-document replace, that
 * pair destroys a malformed `config.json` — including `security.apiKey` and
 * `database.url` — the instant something round-trips it. The bootstrap
 * rule-toggle write path (BST-10) reads through this function instead, so a
 * corrupted `config.json` surfaces as a thrown, named {@link ConfigParseError}
 * rather than a silent overwrite. See `apps/mcp-client/src/config-cli.ts:205-215`
 * for the pre-existing `massa-ai-config set` command that already composes
 * `loadConfig`+`saveConfig` this way — that defect is out of this function's
 * scope and is not fixed here, only avoided by callers that use this seam
 * instead.
 *
 * An absent file returns `{}`. That is a legitimate "nothing configured yet"
 * state, not corruption — the toggle path creates `config.json` on first
 * write, and a throw here would make that first-run case impossible.
 */
export function readRawConfigStrict(): Record<string, unknown> {
  const raw = readConfigFileOrEmpty();
  if (raw === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigParseError(CONFIG_FILE, error);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigParseError(CONFIG_FILE, new Error("parsed value is not a JSON object"));
  }
  return parsed as Record<string, unknown>;
}

/**
 * Never-throwing wrapper around {@link loadConfig}. Returns the defaults on any
 * error (missing/invalid file, JSON parse failure, FS error). Used by env.ts
 * and config/index.ts where config.json is a best-effort middle-precedence
 * layer and must never abort startup.
 *
 * Returns the *effective* config, defaults folded in. When you need to know
 * what the file itself actually said, use {@link loadRawUserConfig}.
 */
export function loadConfigSafe(): MassaAiConfig {
  try {
    return loadConfig();
  } catch {
    return defaultMassaAiConfig;
  }
}

/**
 * One-time, idempotent data-directory migration from the legacy location
 * (`~/.massa-ai-data/`) to the unified XDG config home
 * (`~/.config/massa-ai/data/`). Atomic `rename` on the same volume; a
 * cross-volume move fails rename and surfaces a clear manual-move error.
 *
 * GUARDS (never runs twice, never overwrites, never throws):
 *  - skip if target already exists (already migrated, or user created it)
 *  - skip if source does not exist (nothing to migrate)
 *  - any throw is caught and logged; startup continues
 *
 * Run once at module load. Safe to call repeatedly.
 */
let migrationAttempted = false;
export function migrateDataDirOnce(): void {
  if (migrationAttempted) return;
  migrationAttempted = true;

  try {
    const oldDir = path.join(os.homedir(), ".massa-ai-data");
    const newDir = path.join(getConfigDir(), "data");

    if (fs.existsSync(newDir)) return; // already migrated / present
    if (!fs.existsSync(oldDir)) return; // nothing to migrate

    // Ensure parent of new dir exists, then atomic rename (same volume).
    fs.mkdirSync(path.dirname(newDir), { recursive: true });
    try {
      fs.renameSync(oldDir, newDir);
      console.warn(
        `[massa-ai] Migrated data directory: ${oldDir} -> ${newDir}`,
      );
    } catch (renameErr: any) {
      // Cross-volume (EXDEV) or permission failure: do NOT silently copy —
      // surface a clear manual instruction so the user controls the move.
      console.error(
        `[massa-ai] Could not move data directory ${oldDir} -> ${newDir} ` +
          `(rename failed: ${renameErr?.code || renameErr?.message}). ` +
          `Move it manually, e.g.:\n` +
          `  mv "${oldDir}" "${newDir}"`,
      );
    }
  } catch (err) {
    // Defensive: migration must never abort startup.
    console.error(`[massa-ai] Data directory migration skipped:`, err);
  }
}

/**
 * Test-only seam: clear the module-level one-shot guard so migrateDataDirOnce()
 * can be exercised repeatedly under fs spies. Production code never calls this;
 * the one-shot semantics are fully preserved for real startups.
 */
export function __resetMigrationForTests(): void {
  migrationAttempted = false;
}

/**
 * Monotonic per-process suffix. Combined with the pid and 6 random bytes it
 * keeps two temp files distinct even when the same process saves twice inside
 * the same millisecond.
 */
let tempFileCounter = 0;

/**
 * Write `content` to `targetPath` atomically: a uniquely-named temp file in the SAME
 * directory (never `os.tmpdir()`, which may be a different volume — `rename(2)` is only
 * atomic within a filesystem), then `rename(2)` over the target. The temp file is made
 * owner-only BEFORE the rename (APCR-08.1/08.5): `mode` on `writeFileSync` applies at
 * creation and is masked by the process umask, so the explicit `chmodSync` on the temp is
 * what actually guarantees 0600.
 *
 * The chmod is on the temp file and not on `targetPath` after the rename, for two reasons.
 * `rename(2)` replaces the target's directory entry with the temp file's inode, so the
 * result already carries the temp's mode — an existing 644 file is still repaired on its
 * next write (APCR-08.3), by the rename rather than by a second chmod. And chmodding
 * `targetPath` touched a path this function had not itself created, which under a test
 * that stubs `writeFileSync`/`renameSync` but not `chmodSync` escaped the virtual
 * filesystem and re-moded the developer's real `~/.config/massa-ai/config.json`.
 *
 * Shared by `saveConfig` (config.json) and `savePartialConfig`'s backup writer
 * (config.json.bak.<ISO>) so both go through the identical atomic-plus-owner-only path —
 * never `copyFileSync` followed by a separate `chmod`, which leaves the new file at the
 * source's mode until the chmod lands and cannot revoke a descriptor a same-UID watcher
 * already opened (APCR-08.2).
 */
export function writeFileAtomically(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const unique = `${process.pid}.${++tempFileCounter}.${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(dir, `.${path.basename(targetPath)}.${unique}.tmp`);

  try {
    fs.writeFileSync(tempFile, content, { mode: 0o600 });
    fs.chmodSync(tempFile, 0o600);
    fs.renameSync(tempFile, targetPath);
  } catch (error) {
    // Never leave the temp file behind — a failed save must not litter the
    // config dir with partial copies of a file that may hold the API key.
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Best effort: the temp file may never have been created.
    }
    throw error;
  }
}

/**
 * Persist the config atomically. See {@link writeFileAtomically} — this function's
 * temp-file-plus-rename atomicity is load-bearing (SEC-01: two processes can
 * auto-provision the API key concurrently) and is preserved as-is; only the mode is new.
 */
export function saveConfig(config: MassaAiConfig): void {
  writeFileAtomically(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export interface WriteRawConfigOptions {
  /**
   * The exact file bytes the caller read (via {@link readRawConfigStrict} or
   * an equivalent raw read of `getConfigPath()`) before deriving `doc`, or
   * `""` if the file did not exist at read time. This is the compare-and-swap
   * baseline: if the file on disk still holds exactly these bytes, `doc` is
   * the caller's own read-modify-write and is written verbatim. If not,
   * something else wrote in between.
   */
  expectedBytes: string;
}

/**
 * Compare-and-swap write of a raw config document — the write half of the
 * {@link readRawConfigStrict} seam, and never composed with {@link loadConfig}
 * / {@link saveConfig} for the same reason (BST-10, see `readRawConfigStrict`'s
 * docblock).
 *
 * Fast path: if `config.json` on disk still holds exactly `expectedBytes`,
 * `doc` — the caller's own read-modify-write of that same content — is
 * written as-is. This is also what makes a read-modify-write round trip
 * preserve every top-level key the caller never touched, including ones this
 * module knows nothing about.
 *
 * Race path: if the file no longer matches `expectedBytes`, something wrote
 * in between the caller's read and this call. Rather than clobbering that
 * write, the top-level keys the caller actually changed (present in `doc`
 * with a different value than in the document `expectedBytes` represents, or
 * added, or removed) are re-applied onto the document that is on disk right
 * now — once. Immediately before writing that re-applied document, the file
 * is read again; if it changed a second time, this function throws
 * {@link ConfigWriteConflictError} and writes nothing, rather than retrying
 * indefinitely or overwriting a second concurrent update it never saw.
 */
export function writeRawConfig(doc: Record<string, unknown>, opts: WriteRawConfigOptions): void {
  const onDiskAtStart = readConfigFileOrEmpty();

  if (onDiskAtStart === opts.expectedBytes) {
    writeFileAtomically(CONFIG_FILE, JSON.stringify(doc, null, 2));
    return;
  }

  // Race detected: re-apply only the top-level keys the caller actually
  // changed (expectedBytes -> doc) onto the document that is on disk now.
  let original: Record<string, unknown>;
  let current: Record<string, unknown>;
  try {
    original = opts.expectedBytes === "" ? {} : (JSON.parse(opts.expectedBytes) as Record<string, unknown>);
  } catch (error) {
    throw new ConfigParseError(`${CONFIG_FILE} (caller-supplied expectedBytes)`, error);
  }
  try {
    current = onDiskAtStart === "" ? {} : (JSON.parse(onDiskAtStart) as Record<string, unknown>);
  } catch (error) {
    throw new ConfigParseError(CONFIG_FILE, error);
  }

  const reapplied: Record<string, unknown> = { ...current };
  const touchedKeys = new Set([...Object.keys(original), ...Object.keys(doc)]);
  for (const key of touchedKeys) {
    const before = JSON.stringify(original[key]);
    const after = JSON.stringify(doc[key]);
    if (before === after) continue; // the caller never touched this key
    if (Object.prototype.hasOwnProperty.call(doc, key)) {
      reapplied[key] = doc[key];
    } else {
      delete reapplied[key]; // the caller's change removed this key
    }
  }

  const onDiskImmediatelyBeforeWrite = readConfigFileOrEmpty();
  if (onDiskImmediatelyBeforeWrite !== onDiskAtStart) {
    throw new ConfigWriteConflictError(CONFIG_FILE);
  }

  writeFileAtomically(CONFIG_FILE, JSON.stringify(reapplied, null, 2));
}

export function initConfig(): void {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(defaultMassaAiConfig);
    // stderr, not stdout. initConfig() runs during MCP server startup, and a
    // stdio MCP server's stdout carries nothing but JSON-RPC — one stray byte
    // fails the handshake with "connection closed: initialize response".
    // This only fires on a machine with no config yet, which is why it stayed
    // invisible on developer machines and only ever broke first runs and CI.
    // console.error (not the shared logger) keeps this module dependency-free:
    // the logger reads config, so importing it here would be circular.
    console.error(`Created default config at ${CONFIG_FILE}`);
  }
}

export function getConfigForEnv(): Record<string, string> {
  const config = loadConfig();
  const env: Record<string, string> = {};

  if (config.embedding.provider === "ollama") {
    env.OLLAMA_EMBEDDING_MODEL = config.embedding.model;
    env.OLLAMA_BASE_URL = config.embedding.baseURL || "http://localhost:11434";
    if (config.embedding.dimensions) {
      env.OLLAMA_EMBEDDING_DIMENSIONS = String(config.embedding.dimensions);
    }
  } else if (config.embedding.provider === "mistral") {
    env.MISTRAL_API_KEY = config.embedding.apiKey || "";
    env.MISTRAL_TEXT_EMBEDDING_MODEL = config.embedding.model;
  } else if (config.embedding.provider === "openai") {
    env.OPENAI_API_KEY = config.embedding.apiKey || "";
    env.OPENAI_EMBEDDING_MODEL = config.embedding.model;
  }

  env.LOG_LEVEL = config.logging.level;
  env.ENABLE_METRICS = String(config.logging.enableMetrics);

  return env;
}
