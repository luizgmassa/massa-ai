/**
 * SSE streaming regenerate route (Component 4 — REGEN-01..08, MDS-03
 * T3/T4).
 *
 *   POST /api/v1/model-registry/regenerate-and-install-stream
 *   POST /api/v1/model-registry/regenerate-stream   (deprecated alias, same behavior)
 *
 * Spawns every generator named by the repo's own `generate:artifacts`
 * `package.json` script — today `generate-skill-artifacts.ts` then
 * `generate-subagent-artifacts.ts` — with child_process.spawn (non-blocking,
 * one at a time, in the script's own order), piping stdout/stderr
 * line-by-line to an SSE stream. `deriveGeneratorScripts` reads that list
 * from `package.json` rather than hardcoding it (AC-03.1, AC-03.4) so a
 * future third generator is picked up by construction, and it THROWS on any
 * shape it cannot parse rather than silently returning a short list
 * (AC-03.5) — a defensive `assertGeneratorBackstop` re-checks the derived
 * list against the two known generator filenames before anything is spawned
 * (AC-03.6), so a parser bug that agreed with itself cannot pass by
 * degrading to a shorter list unnoticed. The first generator to exit
 * non-zero stops the chain immediately and names itself in the terminal
 * `done` frame's `error` (AC-03.2) — no later generator runs, and the
 * install phase below never starts.
 *
 * Once every generator has exited 0, this route emits one `skills` SSE
 * frame per host (`{"type":"skills","host":"...","status":"generated"}`,
 * AC-03.3) — the skill generator writes straight into
 * `apps/<host>-plugin/skills/` for all four hosts in one pass, and on the
 * directory-source Claude route that tree already **is** what the host
 * reads (design D1/D3 make that a no-op there); whether the other three
 * hosts' *installed* location is also already reached is unmeasured and
 * owned by MDS-04 (T5), so this frame only reports that generation
 * happened, in the same per-host shape as `variant-sync` / `install` below
 * — it does not invent a new reporting shape. It then bridges the freshly
 * generated `apps/<host>-plugin/agent-profiles/` trees into each host's
 * installed variant root (`syncGeneratedVariants`, see `variant-sync.ts`'s
 * module docblock for why this bridge exists — without it "Regenerate
 * Artifacts" regenerates and then reinstalls from a stale tree) and then
 * calls `switchProfile` for every detected host to reinstall the active
 * profile's agents from those freshly-synced variant dirs. Emits one
 * `variant-sync` SSE frame per host from the bridge step, then one `install`
 * SSE frame per host from the switch step
 * (`data: {"type":"install","host":"...","status":"switched|skipped|failed",...}`),
 * then a terminal `done` event with the exit code.
 *
 * Streaming pattern follows events.ts exactly: return
 * `new Response(new ReadableStream({ start, cancel }), { headers })`. Do NOT
 * use `set.headers` for streaming responses — returning a `Response` bypasses
 * Elysia's built-in serialization; `set` would buffer/JSON-wrap the stream.
 * The `cancel` hook kills the child so a client disconnect does not orphan the
 * spawn (F1 fold).
 */

import { Elysia } from "elysia";
import fs from "node:fs";
import path from "path";
import { spawn } from "child_process";
import { configDir } from "@massa-ai/shared/config";
import {
  listProfiles,
  switchProfile,
  reportSucceeded,
  syncGeneratedVariants,
  HOSTS,
  type Host,
  type HostSwitchStatus,
  type SwitchReport,
} from "@massa-ai/shared";
import { getDeploymentRoot, deploymentUnavailableMessage } from "./model-registry-deployment.js";
import { getRegistryHostDefaults } from "./model-registry.js";

// configDir import is needed so mock.module can intercept @massa-ai/shared/config
// in tests (the route shares the mock surface with model-registry.ts).
void configDir;

const encoder = new TextEncoder();

function sseFrame(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

/** One entry of the generator chain (AC-03.1, AC-03.4). `relPath` is
 *  relative to the resolved deployment root (`getDeploymentRoot()`); `name`
 *  is its basename, used in per-generator `done`/error frames so a failure
 *  names which generator failed (AC-03.2) instead of reporting a bare exit
 *  code. */
interface GeneratorScript {
  readonly relPath: string;
  readonly name: string;
}

/** The two generator filenames `generate:artifacts` names today (AC-03.6).
 *  Deliberately literal, not derived from any parse — `assertGeneratorBackstop`
 *  exists precisely so a bug in the parser below cannot agree with itself and
 *  ship a short list unnoticed. A future third generator only needs adding
 *  here if the backstop should widen with it; until then the check is a
 *  floor ("at least these two"), not a ceiling. */
const KNOWN_GENERATOR_FILENAMES = ["generate-skill-artifacts.ts", "generate-subagent-artifacts.ts"] as const;

/**
 * Derives the ordered list of generator scripts this route must spawn from
 * `package.json`'s own `generate:artifacts` script (AC-03.1, AC-03.4) —
 * never a hardcoded list, so a future third generator is picked up by
 * construction. THROWS (never returns a short or empty list, AC-03.5) on
 * any shape this cannot parse: an unreadable `package.json`, invalid JSON,
 * a missing or non-string `generate:artifacts`, or a `&&`-joined segment
 * that does not match the `bun <script.ts>` shape every entry currently
 * has. A derivation that silently degraded to a short list here would agree
 * with an equally-broken test derivation and reintroduce Defect B through
 * the guard built to prevent it (spec AC-03.5, design D4 item 2).
 */
function deriveGeneratorScripts(root: string): GeneratorScript[] {
  const pkgPath = path.join(root, "package.json");
  let raw: string;
  try {
    raw = fs.readFileSync(pkgPath, "utf-8");
  } catch (e) {
    throw new Error(`cannot read ${pkgPath}: ${(e as Error).message}`);
  }
  let pkg: unknown;
  try {
    pkg = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${pkgPath} is not valid JSON: ${(e as Error).message}`);
  }
  const scriptsField = (pkg as { scripts?: unknown } | null)?.scripts;
  const command = (scriptsField as Record<string, unknown> | undefined)?.["generate:artifacts"];
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new Error(`${pkgPath}'s scripts."generate:artifacts" is missing or not a string`);
  }
  const segments = command.split("&&").map((s) => s.trim()).filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new Error(`"generate:artifacts" parsed to zero commands: ${JSON.stringify(command)}`);
  }
  return segments.map((segment) => {
    const match = /^bun\s+(\S+\.ts)$/.exec(segment);
    if (!match) {
      throw new Error(
        `"generate:artifacts" segment does not match the expected "bun <script.ts>" shape: ${JSON.stringify(segment)}`,
      );
    }
    const relPath = match[1] as string;
    return { relPath, name: path.basename(relPath) };
  });
}

/** Defensive floor beneath `deriveGeneratorScripts` (AC-03.6): a parse that
 *  "succeeds" but produces an implausibly short list — e.g. Defect B's
 *  original one-generator shape, or a `generate:artifacts` edit that lost a
 *  segment — is not itself a parse failure `deriveGeneratorScripts` would
 *  throw on, so this checks the *output* against the literal known
 *  filenames instead of re-parsing. Independent of the regex above by
 *  construction: it never inspects `command` or `segments`, only the
 *  resulting names. */
function assertGeneratorBackstop(scripts: GeneratorScript[]): void {
  const names = scripts.map((s) => s.name);
  const missing = KNOWN_GENERATOR_FILENAMES.filter((f) => !names.includes(f));
  if (scripts.length < 2 || missing.length > 0) {
    throw new Error(
      `generator list ${JSON.stringify(names)} does not contain the known generators ` +
        `${KNOWN_GENERATOR_FILENAMES.join(", ")} — refusing to spawn an implausibly short list`,
    );
  }
}

/** Emits one `skills` SSE frame per host once every generator has exited 0
 *  (T4, AC-03.3). Mirrors the `variant-sync` / `install` per-host frame
 *  shape rather than inventing a new one. See the module docblock for why
 *  `status: "generated"` is the honest claim here — reaching each host's
 *  *installed* location beyond the directory-source Claude route is
 *  measured separately under MDS-04. */
function emitSkillsFrames(controller: ReadableStreamDefaultController<Uint8Array>, closedRef: { closed: boolean }): void {
  for (const host of HOSTS) {
    if (closedRef.closed) return;
    try {
      controller.enqueue(sseFrame({ type: "skills", host, status: "generated" }));
    } catch {
      closedRef.closed = true;
      return;
    }
  }
}

/**
 * Derive the emitted install status from the switch report's actual host
 * outcomes (APCR-06), instead of the report merely *returning* — a report in
 * which every host failed used to still emit `status:"switched"`. Reuses
 * `reportSucceeded` for the switched/skipped success boundary rather than
 * re-deriving it (design D-4): switched if any host switched, else failed if
 * any host failed, else unsupported if any host is unsupported, else skipped.
 */
function deriveInstallStatus(report: SwitchReport): HostSwitchStatus {
  if (report.hosts.some((h) => h.status === "switched")) return "switched";
  // No host switched. `reportSucceeded` is true here exactly when every remaining host is
  // "skipped" (it would be false if any were "failed" or "unsupported") — reused rather than
  // hand-rolling the same every-host check.
  if (reportSucceeded(report)) return "skipped";
  return report.hosts.some((h) => h.status === "failed") ? "failed" : "unsupported";
}

/** Install the active profile's agents for every detected host after
 *  regeneration. First bridges the freshly regenerated variant trees into
 *  each host's installed variant root (one `variant-sync` SSE event per
 *  host — see the module docblock), then emits one `install` SSE event per
 *  host, then returns. */
function installActiveProfiles(controller: ReadableStreamDefaultController<Uint8Array>, closedRef: { closed: boolean }): void {
  try {
    const syncResults = syncGeneratedVariants({ sourceRoot: getDeploymentRoot() });
    for (const r of syncResults) {
      if (closedRef.closed) return;
      controller.enqueue(sseFrame({
        type: "variant-sync",
        host: r.host,
        status: r.status,
        profiles: r.profiles,
        files: r.files,
        retained: r.retained,
        ...(r.reason ? { reason: r.reason } : {}),
        ...(r.error ? { error: r.error } : {}),
      }));
    }

    const inventory = listProfiles({ hostDefaults: getRegistryHostDefaults() });
    for (const hostEntry of inventory.hosts) {
      if (closedRef.closed) return;
      const host = hostEntry.host as Host;
      if (!hostEntry.installed || !hostEntry.activeProfile) {
        if (!closedRef.closed) {
          controller.enqueue(sseFrame({ type: "install", host, status: "skipped", reason: "not installed or no active profile" }));
        }
        continue;
      }
      try {
        const report = switchProfile({ profile: hostEntry.activeProfile, host });
        const status = deriveInstallStatus(report);
        const switched = (report.hosts || []).filter((h: any) => h.status === "switched").map((h: any) => h.host).join(", ") || "none";
        const skipped = (report.hosts || []).filter((h: any) => h.status === "skipped").map((h: any) => `${h.host} (${h.reason || "unknown"})`).join(", ") || "none";
        const unsupported = (report.hosts || []).filter((h: any) => h.status === "unsupported").map((h: any) => `${h.host} (${h.reason || "unknown"})`).join(", ") || "none";
        const failed = (report.hosts || []).filter((h: any) => h.status === "failed").map((h: any) => `${h.host} (${h.reason || "unknown"})`).join(", ") || "none";
        if (!closedRef.closed) {
          controller.enqueue(sseFrame({ type: "install", host, status, profile: hostEntry.activeProfile, switched, skipped, unsupported, failed }));
        }
      } catch (e) {
        if (!closedRef.closed) {
          controller.enqueue(sseFrame({ type: "install", host, status: "failed", error: (e as Error).message }));
        }
      }
    }
  } catch (e) {
    if (!closedRef.closed) {
      controller.enqueue(sseFrame({ type: "install", status: "error", error: `install phase failed: ${(e as Error).message}` }));
    }
  }
}

/**
 * Factory for the SSE regenerate-stream handler (APCR-09). Both
 * `/regenerate-and-install-stream` and its deprecated `/regenerate-stream`
 * alias had byte-equivalent handler bodies; this is the one implementation
 * behind both routes. Each call returns a fresh closure so the two routes
 * never share `child`/`closedRef` state, matching the pre-refactor shape.
 */
function createRegenerateStreamHandler(): () => Response {
  return () => {
    let child: ReturnType<typeof spawn> | null = null;
    const closedRef = { closed: false };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const root = getDeploymentRoot();
        if (!root) {
          controller.enqueue(sseFrame({
            type: "done",
            exitCode: null,
            error: deploymentUnavailableMessage("scripts/generate-subagent-artifacts.ts"),
          }));
          controller.close();
          closedRef.closed = true;
          return;
        }
        let generatorScripts: GeneratorScript[];
        try {
          generatorScripts = deriveGeneratorScripts(root);
          assertGeneratorBackstop(generatorScripts);
        } catch (e) {
          controller.enqueue(sseFrame({
            type: "done",
            exitCode: null,
            error: `could not derive the generator list: ${(e as Error).message}`,
          }));
          controller.close();
          closedRef.closed = true;
          return;
        }

        const emitLine = (streamName: "stdout" | "stderr", chunk: Buffer) => {
          if (closedRef.closed) return;
          const text = chunk.toString();
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.length === 0) continue;
            try {
              controller.enqueue(sseFrame({ type: "line", stream: streamName, text: line }));
            } catch {
              closedRef.closed = true;
              return;
            }
          }
        };

        // Terminal frame + close, guarded so only the first caller wins
        // (mirrors the pre-T3 single-generator shape: closedRef flips before
        // the frame is enqueued, and a second caller after close is a no-op).
        const finish = (exitCode: number | null, error?: string) => {
          if (closedRef.closed) return;
          closedRef.closed = true;
          try {
            controller.enqueue(sseFrame(error !== undefined ? { type: "done", exitCode, error } : { type: "done", exitCode }));
            controller.close();
          } catch {
            // already closed
          }
        };

        // Spawns generatorScripts[index..] one at a time, in the order
        // `generate:artifacts` defines (AC-03.1). The first non-zero exit
        // stops the chain and names the failing generator (AC-03.2); only
        // once every generator has exited 0 does the skills/variant-sync/
        // install phase below run.
        const runGenerator = (index: number) => {
          if (closedRef.closed) return;
          if (index >= generatorScripts.length) {
            try {
              controller.enqueue(sseFrame({ type: "line", stream: "stdout", text: "Installing regenerated agents to active directories..." }));
            } catch {
              closedRef.closed = true;
              return;
            }
            emitSkillsFrames(controller, closedRef);
            installActiveProfiles(controller, closedRef);
            finish(0);
            return;
          }

          const generator = generatorScripts[index] as GeneratorScript;
          const scriptPath = path.join(root, generator.relPath);
          try {
            child = spawn("bun", [scriptPath], {
              env: { ...process.env },
              stdio: ["pipe", "pipe", "pipe"],
            });
          } catch (e) {
            finish(null, `spawn failed (${generator.name}): ${(e as Error).message}`);
            return;
          }

          child.stdout?.on("data", (chunk: Buffer) => emitLine("stdout", chunk));
          child.stderr?.on("data", (chunk: Buffer) => emitLine("stderr", chunk));

          child.on("error", (e: Error) => {
            finish(null, `spawn error (${generator.name}): ${e.message}`);
          });

          child.on("close", (code: number | null) => {
            if (closedRef.closed) return;
            if (code !== 0) {
              finish(code, `${generator.name} failed with exit code ${code}`);
              return;
            }
            runGenerator(index + 1);
          });
        };

        runGenerator(0);
      },
      cancel() {
        closedRef.closed = true;
        try {
          child?.kill();
        } catch {
          // best effort
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  };
}

export const modelRegistryStreamRoutes = new Elysia({ prefix: "/api/v1/model-registry" })
  .post("/regenerate-and-install-stream", createRegenerateStreamHandler(), {
    detail: {
      tags: ["model-registry"],
      summary: "Regenerate skill + subagent artifacts, then auto-install to active dirs (streaming SSE)",
      description:
        "Spawns every generator named by package.json's `generate:artifacts` script (today `generate-skill-artifacts.ts` then `generate-subagent-artifacts.ts`), one at a time in that order, with child_process.spawn (non-blocking). Pipes stdout/stderr line-by-line as SSE; the first generator to exit non-zero stops the chain and names itself in the terminal `done` frame. Once every generator exits 0, emits one `skills` event per host, bridges the freshly generated agent-profiles trees into each host's installed variant root (`variant-sync` events per host), then calls switchProfile for every detected host to reinstall the active profile's agents from those synced variant dirs. Emits `install` events per host, then a terminal `done` event with the exit code.",
    },
  })
  // Deprecated alias — same behavior, kept for backward compat with older UI.
  .post("/regenerate-stream", createRegenerateStreamHandler(), {
    detail: {
      tags: ["model-registry"],
      summary: "Regenerate subagent artifacts + auto-install (streaming SSE, deprecated alias)",
      description:
        "Alias for POST /regenerate-and-install-stream. Kept for backward compat with older UI versions.",
    },
  });