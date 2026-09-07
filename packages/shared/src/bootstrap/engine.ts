/**
 * Bootstrap apply engine (T8 / TASK-008, BST-10, BST-11).
 *
 * `applyBootstrapState` is the one path a toggle takes to disk: read which
 * hosts are recorded in `install-state.json`, resolve the rule state, render
 * the contract once per host, write it, and probe that host's wiring artifact
 * before it is allowed to call the result `written`.
 *
 * Three properties are load-bearing here and each is asserted by the
 * co-located suite rather than left to review:
 *
 *   - **Everything is scoped to `targetHome`.** Both the install-state path and
 *     the rule-state path are derived from it, and nothing in this module
 *     resolves `os.homedir()` or calls `getConfigPath()`. `getConfigPath()`
 *     freezes at module-eval time to the real XDG path
 *     (`config/config-loader.ts:8-9`), so an engine that used it could not be
 *     exercised against a scratch home at all — and the suite would write the
 *     developer's real `~/.claude/MASSA-AI.md` on every run (design.md:342-349).
 *     That is why `resolveBootstrapState` is always called **with** a document
 *     here: called with no argument it reads through `readRawConfigStrict`,
 *     which is bound to that frozen real path (`state.ts:96-97`).
 *   - **`written` means loadable.** The contract file and the wiring that loads
 *     it have two different writers over two different host populations
 *     (design.md:237-253), so a host recorded by a plugin install has skills,
 *     a state entry, and has never had wiring. Reporting `written` there would
 *     report success for a host that cannot load the file at all, so the probe
 *     runs first and a host with no wiring gets `written-not-wired` and the
 *     `scripts/install-skills.sh --apply` remedy (BST-10 AC-10a).
 *   - **A dry run touches no file.** Every write on this path goes through the
 *     single `writeFileAtomically` call below, guarded by `dryRun`; nothing
 *     else in the module opens a file for writing, and `config.json` is never
 *     written by this module in any branch (BST-10 AC-10b).
 *
 * Report assembly is deliberately delegated to `buildBootstrapReport`
 * (`report.ts:127`) rather than done with an object literal: that function owns
 * the `restartRequired` derivation, including the decision that
 * `written-not-wired` does not count toward it, and a second derivation here
 * could disagree with it silently.
 *
 * Test: cd packages/shared && bun test src/bootstrap/__tests__/engine.test.ts
 */

import fs from "fs";
import path from "path";

import { ConfigParseError, writeFileAtomically } from "../config/config-loader";
import { HOSTS, type Host } from "../profile-switch/hosts";
import { readInstallState } from "../profile-switch/state";
import {
  CONTRACT_FILENAME,
  bootstrapContractPath,
  bootstrapStateFilePath,
  renderBootstrap,
} from "./render";
import {
  buildBootstrapReport,
  type BootstrapRenderResult,
  type BootstrapReport,
} from "./report";
import { resolveBootstrapState, type BootstrapState } from "./state";

/**
 * The install-state file name, joined onto the same
 * `<targetHome>/.config/massa-ai/` directory the rule state lives in. Deriving
 * it from {@link bootstrapStateFilePath}'s directory rather than re-joining
 * `targetHome` is what makes "both paths are threaded to `targetHome`" a
 * structural property instead of two independent joins that could drift; the
 * resulting path equals `defaultStatePath` in the profile-switch engine
 * (`profile-switch/engine.ts:60-61`), which is private to that module and so
 * cannot be imported.
 */
const INSTALL_STATE_FILENAME = "install-state.json";

/** The remedy named on every `written-not-wired` row (BST-10 AC-10a). */
const WIRING_REMEDY = "scripts/install-skills.sh --apply";

/**
 * Named error for every engine-level refusal, mirroring
 * {@link BootstrapRenderError}'s shape (`render.ts:80-87`) so a caller branches
 * on `err.name` rather than on a message substring.
 */
export class BootstrapEngineError extends Error {
  readonly details: readonly string[];
  constructor(name: string, message: string, details: readonly string[] = []) {
    super(message);
    this.name = name;
    this.details = details;
  }
}

export interface BootstrapApplyOptions {
  /**
   * Absolute home every path in the pass is resolved against —
   * `install-skills.sh`'s `TARGET_HOME`. A relative value is refused by
   * `bootstrapStateFilePath` with `TargetHomeNotAbsoluteError`.
   */
  readonly targetHome: string;
  /** Plan only: report the status every host would get, write nothing. */
  readonly dryRun?: boolean;
  /**
   * The marked-up bootstrap source text (`skills/AGENTS.md`).
   *
   * Widening of design.md:350-355's `BootstrapApplyOptions`, which names only
   * `targetHome` and `dryRun` and leaves the engine no way to obtain the
   * source at all: the renderer takes it as a string (`render.ts:123-138`) and
   * the only copy in the repository is `<repoRoot>/skills/AGENTS.md`, which
   * `install-skills.sh:213` reads from the checkout. Precedent for carrying
   * caller-supplied paths beyond the design's own data model is
   * `SwitchProfileOptions`, whose `stateFilePath`/`projectRoot` fields serve
   * the same purpose in the sibling engine.
   */
  readonly source?: string;
  /** File to read {@link source} from, when the caller has a path rather than
   *  the text. `source` wins when both are given. */
  readonly sourcePath?: string;
  /**
   * Sink for the BST-10 AC-10b degrade warning. Defaults to `console.warn`,
   * which is stderr — `packages/shared/src/utils/logger.ts` routes every level
   * there on purpose, because a stdio MCP server whose stdout carries anything
   * but JSON-RPC fails its handshake. Tests pass a collector so the message is
   * asserted on rather than only produced.
   */
  readonly onWarning?: (message: string) => void;
}

/**
 * Render and deliver the bootstrap contract to every recorded host.
 *
 * Hosts come from `install-state.json` under `targetHome` and are visited in
 * `HOSTS` order (`profile-switch/hosts.ts:16`), so the returned rows are
 * deterministic and do not depend on the order the installer happened to write
 * that file's `platforms` keys.
 *
 * `resolveHostLayout` is deliberately **not** used: it returns
 * `{route: "skip"}` for cursor unconditionally (`profile-switch/hosts.ts:87-89`)
 * because a profile switch is a no-op there, and Cursor is a first-class target
 * for a contract file (design.md:293).
 *
 * @param options - See {@link BootstrapApplyOptions}. `targetHome` scopes every
 *   read and every write; nothing resolves the real home.
 * @returns A report whose rows are in `HOSTS` order and whose
 *   `restartRequired` is derived by {@link buildBootstrapReport}. Empty `rows`
 *   means no host is recorded — a clean exit-0 outcome, not a failure
 *   (BST-11 AC-6).
 * @throws {BootstrapRenderError} `TargetHomeNotAbsoluteError` when `targetHome`
 *   is relative.
 * @throws {BootstrapEngineError} `BootstrapSourceUnavailableError` when at
 *   least one host is recorded and neither `source` nor `sourcePath` was given;
 *   `BootstrapSourceUnreadableError` when `sourcePath` cannot be read.
 * @throws {InstallStateError} `CorruptInstallStateError` when
 *   `install-state.json` is present but not parseable — a run-level input
 *   failure, not one host's outcome.
 */
export function applyBootstrapState(options: BootstrapApplyOptions): BootstrapReport {
  const { targetHome } = options;
  const dryRun = options.dryRun ?? false;
  const warn = options.onWarning ?? ((message: string) => console.warn(message));

  // Also validates that `targetHome` is absolute, before any file is touched.
  const configPath = bootstrapStateFilePath(targetHome);
  const installStatePath = path.join(path.dirname(configPath), INSTALL_STATE_FILENAME);

  const { platforms } = readInstallState(installStatePath);
  const installed = HOSTS.filter((host) => platforms[host] !== undefined);

  // Returned before the source is needed on purpose: "no host installed" is a
  // clean exit 0 (BST-11 AC-6), and a caller with nothing to render must not be
  // made to supply a source to find that out.
  if (installed.length === 0) {
    return buildBootstrapReport({ rows: [], dryRun, ignoredStateKeys: [] });
  }

  const resolved = resolveRuleState(configPath, warn);
  const source = readSource(options);

  const rows: BootstrapRenderResult[] = installed.map((host) =>
    applyHost({ host, source, state: resolved.state, targetHome, dryRun }),
  );

  return buildBootstrapReport({
    rows,
    dryRun,
    ignoredStateKeys: resolved.ignoredStateKeys,
  });
}

/**
 * Resolve the rule state from `configPath`, degrading to registry defaults with
 * a named warning when the file cannot be read as a JSON object (BST-10 AC-10b).
 *
 * The degrade is here rather than in `resolveBootstrapState`, which throws on a
 * malformed file by design (`state.ts:88-95`): the write path must fail loudly,
 * and an apply pass must not be blocked by an unreadable *preference*. Nothing
 * on this path writes `config.json` — the degrade renders defaults and leaves
 * the offending bytes exactly as they are, so the user's own file is never the
 * casualty of a failed read of it.
 *
 * An absent file is not a failure and warns nothing: it is the ordinary
 * "nothing configured yet" state, and `readRawConfigStrict` treats it the same
 * way (`config/config-loader.ts:213-217`).
 */
function resolveRuleState(
  configPath: string,
  warn: (message: string) => void,
): { state: BootstrapState; ignoredStateKeys: readonly string[] } {
  const raw = readFileOrNull(configPath);
  if (raw === null) return resolveBootstrapState({});

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    warn(degradeWarning(configPath, error));
    return resolveBootstrapState({});
  }

  if (!isPlainObject(parsed)) {
    warn(degradeWarning(configPath, new Error("parsed value is not a JSON object")));
    return resolveBootstrapState({});
  }

  return resolveBootstrapState(parsed);
}

/**
 * The BST-10 AC-10b warning text: a stable name, the file, the parse failure,
 * and what was done instead.
 *
 * Built from `ConfigParseError` (`config/config-loader.ts:18-25`) rather than
 * from a fresh template, so the name and the "file: reason" phrasing a caller
 * sees on the degrade path are the same ones it sees when the strict read
 * throws on the write path.
 */
function degradeWarning(configPath: string, cause: unknown): string {
  const error = new ConfigParseError(configPath, cause);
  return `${error.name}: ${error.message} — rendering the registry bootstrap defaults; ${configPath} was not written`;
}

/** The bootstrap source text, from `source` or `sourcePath`. */
function readSource(options: BootstrapApplyOptions): string {
  if (options.source !== undefined) return options.source;

  if (options.sourcePath !== undefined) {
    const text = readFileOrNull(options.sourcePath);
    if (text === null) {
      throw new BootstrapEngineError(
        "BootstrapSourceUnreadableError",
        `could not read the bootstrap source at ${options.sourcePath}`,
        [options.sourcePath],
      );
    }
    return text;
  }

  // Refused rather than defaulted: every candidate default is wrong somewhere.
  // `skills/AGENTS.md` exists only in a repository checkout, and rendering from
  // a host's already-rendered `MASSA-AI.md` is impossible because the render
  // strips every marker (render.ts:19-23). A guessed default would surface as a
  // contract rendered from the wrong source, which no row status can express.
  throw new BootstrapEngineError(
    "BootstrapSourceUnavailableError",
    "no bootstrap source given — pass `source` (the skills/AGENTS.md text) or `sourcePath`",
    ["source", "sourcePath"],
  );
}

interface ApplyHostInput {
  readonly host: Host;
  readonly source: string;
  readonly state: BootstrapState;
  readonly targetHome: string;
  readonly dryRun: boolean;
}

/**
 * One host's outcome. Never throws — a render or write failure becomes that
 * host's `failed` row so sibling hosts still run, the per-host abort shape
 * `scripts/install-skills.sh:571-579` already uses.
 */
function applyHost(input: ApplyHostInput): BootstrapRenderResult {
  const { host, source, state, targetHome, dryRun } = input;
  const contractPath = bootstrapContractPath(host, targetHome);

  let contract: string;
  try {
    contract = renderBootstrap({ source, state, host, targetHome }).contract;
  } catch (error) {
    return { host, status: "failed", reason: (error as Error).message };
  }

  const wired = isWired(host, targetHome);
  const notWired = (): BootstrapRenderResult => ({
    host,
    status: "written-not-wired",
    reason: notWiredReason(host, targetHome),
  });

  if (readFileOrNull(contractPath) === contract) {
    // Already byte-identical, so nothing changed and no session needs a
    // restart for this host — reporting `written` would make
    // `buildBootstrapReport` raise `restartRequired` for a no-op, which is the
    // shape a repeated `bootstrap enable <already-enabled-rule>` takes.
    // Missing wiring still outranks it: that host needs the remedy whether or
    // not this pass rewrote its file.
    return wired ? { host, status: "skipped", reason: `${contractPath} is already up to date` } : notWired();
  }

  if (!dryRun) {
    try {
      writeFileAtomically(contractPath, contract);
    } catch (error) {
      return {
        host,
        status: "failed",
        reason: `could not write ${contractPath}: ${(error as Error).message}`,
      };
    }
  }

  return wired ? { host, status: "written" } : notWired();
}

/** One host's wiring artifact: the file that must load the contract, and the
 *  text that proves it does. */
interface WiringArtifact {
  readonly file: string;
  readonly token: string;
}

/**
 * Where each host loads `MASSA-AI.md` from, per design.md:204-209's delivery
 * table. Each entry was verified against the host's own mechanism:
 *
 *   - **claude** — `~/.claude/CLAUDE.md` holding `@MASSA-AI.md`. Claude Code
 *     reads `CLAUDE.md`, never `AGENTS.md`, and its `@` import resolves
 *     relative to the containing file (design.md:69), which is why the token is
 *     the bare relative form and not an absolute path.
 *   - **codex / cursor** — the pointer block in that host's `AGENTS.md`, which
 *     `render.ts:440-450` emits carrying the absolute contract path. Matching
 *     that path rather than the block's heading is what makes the probe
 *     specific to *this* target home: a pointer left behind by an install into
 *     a different home names a different path and is correctly not wiring.
 *   - **opencode** — the absolute path as an `instructions` entry in the
 *     OpenCode config. The token is the quoted form because an `instructions`
 *     member is always a JSON string, which distinguishes it from the same path
 *     mentioned in a comment of a `.jsonc` config.
 *
 * The four config directories mirror `installer_host_config_dir`
 * (`scripts/lib/installer-shared.sh:192-200`) through
 * `bootstrapContractPath` (`render.ts:94-105`), so this module holds no second
 * copy of that map.
 */
function wiringArtifact(host: Host, targetHome: string): WiringArtifact {
  const contractPath = bootstrapContractPath(host, targetHome);
  switch (host) {
    case "claude":
      return {
        file: path.join(targetHome, ".claude", "CLAUDE.md"),
        token: `@${CONTRACT_FILENAME}`,
      };
    case "codex":
      return { file: path.join(targetHome, ".codex", "AGENTS.md"), token: contractPath };
    case "cursor":
      return { file: path.join(targetHome, ".cursor", "AGENTS.md"), token: contractPath };
    case "opencode":
      return { file: openCodeConfigPath(targetHome), token: `"${contractPath}"` };
  }
}

/**
 * The OpenCode config file this probe reads, mirroring `resolveConfigPath`
 * (`scripts/lib/opencode-config.cjs:26-44`) exactly: `.json` wins when both
 * exist, because OpenCode core merges `opencode.json` **over**
 * `opencode.jsonc`; otherwise whichever exists; and `.jsonc` when neither
 * does, which is the path that module would create.
 *
 * That module is CommonJS under `scripts/lib/`, which `packages/shared` cannot
 * import (design.md:65) — hence the mirror rather than a call. Mirroring the
 * winner rather than accepting either file keeps the failure on the safe side:
 * a `.jsonc`-only entry shadowed by a `.json` that redeclares `instructions`
 * reads as not-wired, and the remedy that names is idempotent.
 */
function openCodeConfigPath(targetHome: string): string {
  const dir = path.join(targetHome, ".config", "opencode");
  const json = path.join(dir, "opencode.json");
  if (fs.existsSync(json)) return json;
  return path.join(dir, "opencode.jsonc");
}

/**
 * Whether `host` has an artifact that loads the contract.
 *
 * An unreadable or absent wiring file is not wiring — every read failure
 * resolves to `false` on purpose. The two error directions are not
 * symmetrical: a false `written-not-wired` names an idempotent remedy, while a
 * false `written` is exactly the silent-wrong-state this probe exists to
 * prevent (design.md:248-253).
 */
function isWired(host: Host, targetHome: string): boolean {
  const artifact = wiringArtifact(host, targetHome);
  const text = readFileOrNull(artifact.file);
  return text !== null && text.includes(artifact.token);
}

/** The `written-not-wired` reason: what is missing, where, and the remedy. */
function notWiredReason(host: Host, targetHome: string): string {
  const artifact = wiringArtifact(host, targetHome);
  return `contract written, but ${host} has no artifact that loads it — expected ${artifact.token} in ${artifact.file}; run ${WIRING_REMEDY} to add the wiring`;
}

/** File contents, or `null` when the file cannot be read for any reason. */
function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** A plain (non-array, non-null) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
