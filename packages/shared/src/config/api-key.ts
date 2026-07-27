/**
 * Tools API key resolution and first-start provisioning (SEC-01).
 *
 * The API used to serve every request when no key was configured, which is the
 * default state of a fresh install — `MASSA_AI_API_KEY` is in neither
 * `.env.example` nor the `.env` the installers write. Requiring a key outright
 * would break every existing install, so a key is instead *always made to
 * exist*: env first, then config.json, and failing both, one is generated and
 * persisted. Anonymous access is never served, and no operator has to act.
 *
 * Storage lives in `config.json` under `security.apiKey` rather than in a
 * second secret file, following the `llm.apiKey` / `embedding.apiKey`
 * precedent, which also means it inherits the documented
 * `env > config.json > default` precedence for free.
 *
 * NOT called at module-import time by anything. `apps/tools-api` calls this
 * from an explicit `initAuth()`; importing a module must never have "writes a
 * secret to the user's home directory" as a side effect, or `bun test` would
 * provision a key into every developer's and CI runner's real config.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { loadConfig, saveConfig, getConfigDir, getConfigPath } from "./config-loader";

export type ApiKeySource = "env" | "config" | "generated";

export interface ResolvedApiKey {
  /** The runtime key. Always non-empty. */
  key: string;
  /** True when this call generated and persisted a key that did not exist. */
  provisioned: boolean;
  source: ApiKeySource;
}

/**
 * Thrown when a key has to be generated and `config.json` cannot be written.
 * The API treats this as fatal and exits before binding the port — starting
 * without a key would be exactly the unauthenticated exposure SEC-01 closes.
 */
export class ApiKeyProvisioningError extends Error {
  readonly configPath: string;

  constructor(configPath: string, cause: unknown) {
    super(
      `Could not provision a Tools API key: ${configPath} is not writable. ` +
        `Set MASSA_AI_API_KEY explicitly, or make that path writable. ` +
        `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "ApiKeyProvisioningError";
    this.configPath = configPath;
  }
}

/** A key that is empty or whitespace-only is not a key. */
function usable(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * One warn line per process, no matter how many times this is called. The
 * message names the config path so an operator can find the key; it never
 * contains the key itself, because this stream is routinely captured into CI
 * logs and MCP host logs.
 */
let warnedAboutProvisioning = false;

function warnProvisioned(configPath: string): void {
  if (warnedAboutProvisioning) return;
  warnedAboutProvisioning = true;
  // console.warn writes to stderr. stdout belongs to the MCP JSON-RPC protocol,
  // and the shared logger reads config, so importing it here would be circular.
  console.warn(
    `[massa-ai] No API key was configured, so one was generated and saved to ${configPath}. ` +
      `Read it from that file to authenticate clients, or set MASSA_AI_API_KEY to override it.`,
  );
}

/** Name of the mutex file. Dot-prefixed so it sorts beside config.json. */
const LOCK_FILENAME = ".api-key.provision.lock";
/** How long to wait for another process's provisioning before assuming it died. */
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 10;

/**
 * Synchronous sleep. `resolveApiKey` is sync because the API resolves the key
 * during startup before binding, and Atomics.wait is the portable sync sleep —
 * `Bun.sleepSync` would tie this published package to the Bun runtime.
 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Generate and persist a key, electing a single provisioner across processes.
 *
 * Re-reading after the write — the mechanism the design originally specified —
 * is NOT sufficient, and the concurrent-start test proves it: with N processes
 * every one writes its own key and the last write wins, so any process that
 * re-read before that last write returns a key that is not the one on disk.
 * Operators are told to read the key out of config.json, so a process using a
 * different one rejects every request they then make.
 *
 * `open(…, "wx")` is an atomic exclusive create, so exactly one process becomes
 * the provisioner. The others block until the lock clears and then take the
 * ordinary config.json path, which means they also do not emit the
 * provisioning warning — one process provisions, one line is logged.
 */
function provisionApiKey(): ResolvedApiKey {
  const configDir = getConfigDir();
  const configPath = getConfigPath();
  const lockPath = path.join(configDir, LOCK_FILENAME);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  for (;;) {
    // A process that held the lock before us may have already provisioned.
    const existing = usable(loadConfig().security?.apiKey);
    if (existing) return { key: existing, provisioned: false, source: "config" };

    let fd: number;
    try {
      fs.mkdirSync(configDir, { recursive: true });
      fd = fs.openSync(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        // Unwritable config dir — the fatal case SEC-01 exits on.
        throw new ApiKeyProvisioningError(configPath, error);
      }
      if (Date.now() > deadline) {
        // The holder died before releasing. Clear it and contend again; the
        // exclusive create still guarantees only one winner on the retry.
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Someone else cleared it first — equally fine.
        }
      }
      sleepSync(LOCK_POLL_MS);
      continue;
    }

    try {
      const generated = crypto.randomBytes(32).toString("hex");
      const current = loadConfig();
      saveConfig({ ...current, security: { ...current.security, apiKey: generated } });
      warnProvisioned(configPath);
      return { key: generated, provisioned: true, source: "generated" };
    } catch (error) {
      throw new ApiKeyProvisioningError(configPath, error);
    } finally {
      fs.closeSync(fd);
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Best effort; a leftover lock is recovered by the staleness deadline.
      }
    }
  }
}

/**
 * Resolve the runtime API key, provisioning one when neither source has it.
 *
 * @throws {ApiKeyProvisioningError} when generation is required and the config
 * file cannot be written.
 */
export function resolveApiKey(): ResolvedApiKey {
  const fromEnv = usable(process.env.MASSA_AI_API_KEY);
  if (fromEnv) return { key: fromEnv, provisioned: false, source: "env" };

  const fromConfig = usable(loadConfig().security?.apiKey);
  if (fromConfig) return { key: fromConfig, provisioned: false, source: "config" };

  return provisionApiKey();
}
