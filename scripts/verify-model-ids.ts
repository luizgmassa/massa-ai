#!/usr/bin/env bun
/**
 * Verify every model id in `skills/model-profiles.json` against the harness CLI that has
 * to resolve it (MPR-R12).
 *
 *   bun scripts/verify-model-ids.ts            # probe every installed host
 *   bun scripts/verify-model-ids.ts --host opencode
 *   bun scripts/verify-model-ids.ts --json
 *
 * Why this exists: a model id is only real if the host resolves it. Three of the four
 * hosts fail SILENTLY or late on an unresolvable id, so a typo ships and then degrades
 * at runtime instead of at build time. Probing the CLI is the only way to know.
 *
 * ADVISORY, not a blocking CI gate. CI has no harness CLI installed, so wiring this into
 * the required checks would either fail on every run or pass vacuously. It is a local
 * pre-flight for whoever edits the registry.
 *
 * An absent CLI is reported as SKIPPED with the reason, never as a pass. A gate that
 * silently reports success when it could not run is worse than no gate.
 */

import { spawnSync } from "child_process";
import {
  HOSTS,
  loadRegistry,
  type Host,
  type Registry,
} from "./lib/model-profiles.ts";

type Verdict = "ok" | "missing" | "skipped" | "unverifiable";

interface Probe {
  readonly host: Host;
  /** Command that lists resolvable model ids, or null when the host has no such command. */
  readonly command: readonly string[] | null;
  /** Why this host cannot be probed, when `command` is null. */
  readonly reason?: string;
}

/**
 * How to enumerate resolvable ids per host.
 *
 * claude   — model values are documented ALIASES (haiku/sonnet/opus/fable) plus full ids.
 *            There is no CLI that enumerates them, and `inherit` is always valid, so
 *            alias membership is checked against the documented set instead of a probe.
 * codex    — the model list is documented, not CLI-enumerable in a stable machine format.
 * cursor   — `cursor-agent models` is the documented discovery path. The GUI `cursor`
 *            binary does not expose it.
 * opencode — `opencode models` prints one `provider/model-id` per line. Fully probeable.
 */
const PROBES: readonly Probe[] = [
  {
    host: "opencode",
    command: ["opencode", "models"],
  },
  {
    host: "cursor",
    command: ["cursor-agent", "models"],
  },
  {
    host: "claude",
    command: null,
    reason:
      "Claude Code has no CLI that enumerates subagent model values; aliases are validated against the documented set (code.claude.com/docs/en/sub-agents.md)",
  },
  {
    host: "codex",
    command: null,
    reason:
      "Codex publishes its model list in docs, not in a stable machine-readable CLI listing (learn.chatgpt.com/docs/models)",
  },
];

/** Documented Claude subagent model aliases. `inherit` is handled separately. */
const CLAUDE_ALIASES = new Set(["haiku", "sonnet", "opus", "fable"]);

export function which(bin: string): boolean {
  const r = spawnSync("command", ["-v", bin], { shell: true, encoding: "utf8" });
  return r.status === 0 && (r.stdout ?? "").trim() !== "";
}

/** Every distinct non-null model id the registry pins for a host. */
export function idsForHost(registry: Registry, host: Host): string[] {
  const ids = new Set<string>();
  for (const profile of Object.values(registry.profiles)) {
    const hostMap = profile.hosts[host];
    if (!hostMap) continue;
    for (const entry of Object.values(hostMap)) {
      if (entry.model !== null) ids.add(entry.model);
    }
  }
  return [...ids].sort();
}

export interface HostResult {
  readonly host: Host;
  readonly verdict: Verdict;
  readonly reason?: string;
  readonly ids: ReadonlyArray<{ id: string; ok: boolean }>;
}

export function verifyHost(registry: Registry, probe: Probe): HostResult {
  const ids = idsForHost(registry, probe.host);

  // Nothing pinned means nothing to verify — `inherit` everywhere is trivially valid.
  if (ids.length === 0) {
    return { host: probe.host, verdict: "ok", reason: "no model pinned (inherit)", ids: [] };
  }

  if (probe.host === "claude") {
    // Alias or full id. A full id cannot be checked offline, so it is reported as such
    // rather than assumed good.
    const checked = ids.map((id) => ({ ok: CLAUDE_ALIASES.has(id), id }));
    const unknown = checked.filter((c) => !c.ok);
    return unknown.length === 0
      ? { host: probe.host, verdict: "ok", reason: "all values are documented aliases", ids: checked }
      : {
          host: probe.host,
          verdict: "unverifiable",
          reason: `${unknown.length} value(s) are not documented aliases; they may be valid full model ids, which cannot be checked offline`,
          ids: checked,
        };
  }

  if (probe.command === null) {
    return {
      host: probe.host,
      verdict: "skipped",
      reason: probe.reason ?? "no probe available",
      ids: ids.map((id) => ({ id, ok: false })),
    };
  }

  const [bin, ...args] = probe.command;
  if (!which(bin!)) {
    return {
      host: probe.host,
      verdict: "skipped",
      reason: `\`${bin}\` is not installed`,
      ids: ids.map((id) => ({ id, ok: false })),
    };
  }

  const res = spawnSync(bin!, args, { encoding: "utf8", timeout: 60_000 });
  if (res.status !== 0) {
    return {
      host: probe.host,
      verdict: "skipped",
      reason: `\`${probe.command.join(" ")}\` exited ${res.status}`,
      ids: ids.map((id) => ({ id, ok: false })),
    };
  }

  const available = new Set(
    (res.stdout ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const checked = ids.map((id) => ({ id, ok: available.has(id) }));
  return {
    host: probe.host,
    verdict: checked.every((c) => c.ok) ? "ok" : "missing",
    ids: checked,
  };
}

export function verifyAll(registry: Registry, hosts: readonly Host[] = HOSTS): HostResult[] {
  return PROBES.filter((p) => hosts.includes(p.host)).map((p) => verifyHost(registry, p));
}

/** Exit non-zero only on a real miss. A skip is not a failure, and not a pass either. */
export function exitCodeFor(results: readonly HostResult[]): number {
  return results.some((r) => r.verdict === "missing") ? 1 : 0;
}

function render(results: readonly HostResult[]): void {
  const mark: Record<Verdict, string> = {
    ok: "OK      ",
    missing: "MISSING ",
    skipped: "SKIPPED ",
    unverifiable: "UNKNOWN ",
  };
  for (const r of results) {
    const suffix = r.reason ? ` — ${r.reason}` : "";
    console.log(`${mark[r.verdict]}${r.host}${suffix}`);
    for (const { id, ok } of r.ids) {
      if (r.verdict === "skipped") console.log(`           ?  ${id}`);
      else console.log(`           ${ok ? "✓" : "✗"}  ${id}`);
    }
  }
  const skipped = results.filter((r) => r.verdict === "skipped");
  if (skipped.length > 0) {
    console.log(
      `\n${skipped.length} host(s) SKIPPED — not verified, and deliberately not counted as passing.`,
    );
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const hostArgIdx = argv.indexOf("--host");
  const only = hostArgIdx >= 0 ? argv[hostArgIdx + 1] : undefined;
  const hosts = only ? HOSTS.filter((h) => h === only) : HOSTS;
  if (only && hosts.length === 0) {
    console.error(`unknown host "${only}"; expected one of ${HOSTS.join(", ")}`);
    return 2;
  }
  const registry = loadRegistry();
  const results = verifyAll(registry, hosts);
  if (argv.includes("--json")) console.log(JSON.stringify(results, null, 2));
  else render(results);
  return exitCodeFor(results);
}

if (import.meta.main) {
  const code = await main();
  if (code !== 0) process.exit(code);
}
