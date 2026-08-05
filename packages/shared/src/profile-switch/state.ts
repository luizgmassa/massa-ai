/**
 * install-state.json (v2) typed read/validate/merge-write, scoped to what the
 * profile-switch engine needs. Mirrors the read-modify-write discipline of
 * `scripts/install-skills.sh`'s `state_replace` and every plugin
 * `record_plugin_version()`: unknown fields — at the top level and on every
 * per-platform record — are preserved verbatim, never stripped or reordered
 * away. The engine is the only writer of `platforms[host].modelProfile`
 * (design "Installer role"); this module has no opinion on that invariant,
 * it just never drops fields it doesn't know about.
 *
 * Every failure is a named error (MPS-09): corrupt or malformed JSON on read,
 * or a filesystem failure on write. `writeInstallState` validates before it
 * touches disk, so a validation failure never partially writes.
 */
import fs from "node:fs";
import path from "node:path";

export interface PluginRecord {
  readonly version: string;
  readonly installedAt: string;
}

/** Installer-owned (design F1): "marketplace" | "file" | absent. The switch
 * engine only ever reads this field; installers are its sole writer. */
export type InstallRoute = "file" | "marketplace";

/** Engine-owned (design C1): `{profile, switchedAt}` — bundle version is
 * reported from the existing `plugin.version` field, not duplicated here. */
export interface ModelProfileRecord {
  readonly profile: string;
  readonly switchedAt: string;
}

export interface PlatformRecord {
  root: string;
  skills: string[];
  skillsOwner: "repo" | "plugin";
  plugin?: PluginRecord;
  installRoute?: InstallRoute;
  modelProfile?: ModelProfileRecord;
  /** Any field this module does not know about is preserved as-is. */
  [key: string]: unknown;
}

export interface InstallState {
  version: number;
  platforms: Record<string, PlatformRecord>;
  /** Any field this module does not know about is preserved as-is. */
  [key: string]: unknown;
}

export class InstallStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallStateError";
  }
}

function namedError(name: string, message: string): InstallStateError {
  const err = new InstallStateError(message);
  err.name = name;
  return err;
}

export const CorruptInstallStateError = (filePath: string, cause: string): InstallStateError =>
  namedError("CorruptInstallStateError", `install-state.json at ${filePath} is corrupt: ${cause}`);

export const UnwritableInstallStateError = (filePath: string, cause: string): InstallStateError =>
  namedError(
    "UnwritableInstallStateError",
    `could not write install-state.json at ${filePath}: ${cause}`,
  );

const DEFAULT_STATE = (): InstallState => ({ version: 2, platforms: {} });

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validates the loose shape the engine relies on (root object, `platforms`
 * object when present) and returns a typed `InstallState` that otherwise
 * preserves every field of `raw` unchanged. Does not validate the interior
 * of individual platform records — installers already write those
 * defensively, and this module's contract is "don't corrupt or drop
 * fields", not "police every writer's schema".
 */
function validateShape(raw: unknown, filePath: string): InstallState {
  if (!isPlainObject(raw)) {
    throw CorruptInstallStateError(filePath, "root is not a JSON object");
  }
  if (raw.platforms !== undefined && !isPlainObject(raw.platforms)) {
    throw CorruptInstallStateError(filePath, '"platforms" is present but not an object');
  }
  const platforms = isPlainObject(raw.platforms) ? (raw.platforms as Record<string, PlatformRecord>) : {};
  return {
    ...raw,
    version: typeof raw.version === "number" ? raw.version : 2,
    platforms,
  } as InstallState;
}

/** Reads install-state.json. A missing file reads as the empty v2 default —
 * that mirrors every existing writer's own "fresh" fallback. */
export function readInstallState(filePath: string): InstallState {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return DEFAULT_STATE();
    throw CorruptInstallStateError(filePath, `could not read file: ${(err as Error).message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw CorruptInstallStateError(filePath, `invalid JSON: ${(err as Error).message}`);
  }

  return validateShape(raw, filePath);
}

/** Writes install-state.json. Validates the given state's shape before any
 * filesystem access — a validation failure throws and leaves the on-disk
 * file untouched. A filesystem failure (unwritable directory, etc.) throws
 * `UnwritableInstallStateError`. */
export function writeInstallState(filePath: string, state: InstallState): void {
  const validated = validateShape(state, filePath);
  const text = `${JSON.stringify(validated, null, 2)}\n`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text);
  } catch (err) {
    throw UnwritableInstallStateError(filePath, (err as Error).message);
  }
}

/**
 * Read-modify-write a single platform's record, preserving every existing
 * field on that record, every sibling platform, and every unknown top-level
 * field — the `state_replace` / `record_plugin_version()` precedent. Creates
 * a minimal record (matching the existing writers' own fallback shape) when
 * the host has no prior entry.
 */
export function updatePlatform(
  filePath: string,
  host: string,
  patch: Partial<PlatformRecord>,
): InstallState {
  const state = readInstallState(filePath);
  const existing: PlatformRecord = isPlainObject(state.platforms[host])
    ? state.platforms[host]
    : { root: "", skills: [], skillsOwner: "plugin" };
  const merged: PlatformRecord = { ...existing, ...patch };
  const next: InstallState = {
    ...state,
    platforms: { ...state.platforms, [host]: merged },
  };
  writeInstallState(filePath, next);
  return next;
}
