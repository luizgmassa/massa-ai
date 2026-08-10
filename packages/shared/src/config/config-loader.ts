import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { MassaAiConfig, defaultMassaAiConfig } from "./massa-ai-config";
import { configDir } from "./xdg";

const CONFIG_DIR = configDir("massa-ai");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

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
 * Never-throwing wrapper around {@link loadConfig}. Returns the defaults on any
 * error (missing/invalid file, JSON parse failure, FS error). Used by env.ts
 * and config/index.ts where config.json is a best-effort middle-precedence
 * layer and must never abort startup.
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
