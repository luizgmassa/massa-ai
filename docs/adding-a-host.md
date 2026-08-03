# Adding a Host

**Status**: prep only (XP-06). This document describes the capability
contract a future 5th host must declare and the surfaces it must touch.
No 5th host adapter ships as part of this document or the feature that
introduced it (`cross-pollination-ports`) — see
`.specs/features/cross-pollination-ports/spec.md` §Out of Scope ("Building
an actual 5th-host adapter"). `scripts/__tests__/host-capabilities.test.ts`'s
"fixture 5th host" describe block proves the mechanism works without
shipping one.

## The table-first rule

A new host is added by **declaring its capabilities first**, in
`scripts/lib/host-capabilities.ts`, before writing any host-specific
generator or installer code. That module is the single explicit
declaration of what differs between hosts; `scripts/generate-subagent-
artifacts.ts` and `scripts/generate-skill-artifacts.ts` consume it rather
than branching on a host name. Adding a host by patching emitter
ternaries under pressure — the pattern this refactor retires — silently
reintroduces the exact defect XP-06 exists to close: a capability
decision made once, invisibly, at a single call site, instead of once,
explicitly, in one table every generator reads.

## The `HostCapabilities` contract

Every field below is declared in `scripts/lib/host-capabilities.ts`'s
`HostCapabilities` interface. A new host's entry in `HOST_CAPABILITIES`
must set all eight; there is no default and no optional field — an
omitted field is a compile error (`Record<Host, HostCapabilities>` requires
every property).

| Field | Type | How to determine it |
|---|---|---|
| `artifactExtension` | `"md" \| "toml"` | The file extension the host's own subagent-definition format uses. Read the host's official subagent documentation (Claude, Cursor, and OpenCode all use Markdown-with-frontmatter; Codex uses TOML). Mechanically consumed by `generate-subagent-artifacts.ts`'s `emitAll`/`diffHost` via `capabilitiesFor(host).artifactExtension`. |
| `agentIdentity` | `"frontmatter-name" \| "filename"` | Whether the host reads the agent's display name from a `name`-shaped frontmatter field, or infers it from the file's own name. Determine by reading the host's subagent schema documentation; if it lists no `name` key, assume `"filename"` and confirm empirically (a name-bearing file and a name-less file with different filenames producing the same displayed name is the tell). Documentation-bearing today — not yet wired into a generator, since only OpenCode currently omits `name`. |
| `ownershipMarker` | `"frontmatter" \| "body" \| "filename"` | Where the "this file is massa-ai-generated" signal lives, so the host's `agents uninstall` path can remove only owned files. Determine by reading the corresponding `install.sh`'s uninstall block for an existing host as a template, or — for a genuinely new host — by choosing the mechanism that survives `forwardsUnknownFrontmatter` (see below): if the host forwards unrecognized frontmatter keys to a model provider, the marker MUST NOT live in frontmatter (use `"body"`); if the host has no per-file name/marker mechanism at all, the marker is effectively the `massa-ai-` filename prefix (use `"filename"`, matching Claude and Cursor's actual measured behavior — see the SPEC_DEVIATION note in `host-capabilities.ts`'s module docblock for why this is a 3-value field, not the 2-value one first proposed in design.md). |
| `forwardsUnknownFrontmatter` | `boolean` | Whether the host passes frontmatter keys it does not recognize through to the model provider as model options (a real, measured OpenCode behavior: `https://opencode.ai/docs/agents/`). Read the host's plugin/subagent documentation for this exact behavior before assuming `false` — assuming `false` incorrectly is how a stray marker key becomes a live, user-visible model option. |
| `hookBinaryDelivery` | `"source" \| "real-copy" \| "none"` | How the shared hook binary (`apps/claude-plugin/hooks/massa-ai-hook.ts`, the canonical source) reaches this host's plugin bundle. `"source"` only applies to claude-plugin itself. `"real-copy"` means `generate-skill-artifacts.ts` must chmod+copy a real file (never a symlink: `npm pack` silently drops symlink entries — verified empirically when Codex/Cursor's `hooks/massa-ai-hook` were symlinks and neither the link nor its target directory reached the published tarball). `"none"` means the host has no shared hook binary at all (OpenCode's plugin entry is `src/index.ts`, in-process). Mechanically consumed via `hookBinaryHosts()` in `generate-skill-artifacts.ts`. |
| `extraManagedRoots` | `readonly string[]` | Directories beyond `skills/{massa-ai,persona-router,agents}` that this host's skill bundle manages, relative to the plugin root (OpenCode: `["lib"]`, for its vendored `opencode-config.cjs` copy). Determine from what the new host's plugin package actually needs vendored at install time; empty for a host with no extra vendored assets. Mechanically consumed via `managedRootsFor()` in `generate-skill-artifacts.ts`. |
| `sessionStartStdoutDelivered` | `boolean \| null` | Whether a `SessionStart`-equivalent lifecycle hook's stdout is actually injected into the model's context on this host. **This is the first quirk class** — see below. `null` means unverified: don't guess here, and don't leave it `null` if this repo starts relying on the behavior for that host. |
| `handoffInjectionPoint` | `"session-start" \| "user-prompt-submit" \| null` | Which lifecycle hook actually carries the persona-router / `AGENTS.md` startup contract into the model's context for this host. **This is the second quirk class** — see below. `null` means the contract is delivered through a managed instruction file installed once (Claude, OpenCode today), not through any session-lifecycle hook. |

## The two quirk classes (from the ai-memory evidence)

A sibling managed-harness project's evidence
(`.specs/reports/ai-memory-changes-2a85950-to-head.md`) documents that
lifecycle-hook delivery is genuinely not uniform across AI coding
hosts, and a new host must be measured, not assumed:

1. **SessionStart-stdout-discarding hosts.** Kimi Code and Grok Build
   CLI both fire a `SessionStart`-equivalent hook but silently discard
   its stdout — the hook runs, but nothing it prints ever reaches the
   model. A host with this quirk will look like it works in manual
   testing (the hook process exits 0) while delivering nothing. Verify
   by round-tripping a distinctive marker string through the hook and
   confirming the model can see it in the same turn, not just that the
   hook process succeeded.
2. **Passive-`UserPromptSubmit` hosts.** The mitigation for quirk class
   1 is moving delivery to `UserPromptSubmit`, whose stdout Kimi does
   inject as a `hook_result` user message — but a host whose
   `UserPromptSubmit` hook is merely observational (fires, but its
   output is discarded too, as with Grok) has no working hook-based
   delivery path at all, and needs a non-hook mechanism instead (Grok
   uses a native `--rules` flag; this repo's own Claude/OpenCode use a
   managed instruction file installed once, for the analogous reason —
   see `skills/massa-ai/personas/README.md`'s "Automatic Routing"
   section, cited above as the source for `handoffInjectionPoint`'s
   real per-host values).

A new host's `sessionStartStdoutDelivered` and `handoffInjectionPoint`
values must be set from an actual verification against that host, not
copied from the nearest-seeming existing host — Codex and Cursor both
resolve to `"session-start"` today, but that is a measured fact about
those two hosts specifically, not a default.

## Sibling surfaces a real 5th host must touch

Declaring `HOST_CAPABILITIES` and updating the two TS generators is
necessary but not sufficient. A real host addition also touches:

- **`scripts/lib/installer-shared.sh:190-215`** — the bash case-statement
  tables `installer_host_config_dir()` (the host's user config directory,
  e.g. `.claude`, `.config/opencode`) and `installer_host_binaries()` (the
  CLI binary name(s) to probe for on `PATH`). These drive plugin
  auto-detection (`installer_host_detected()`, same file) and are
  hand-authored bash, not derived from `HOST_CAPABILITIES` — there is no
  TypeScript-to-bash code generation in this repo, so a new host's entry
  here is a manual, parallel edit. An unknown host passed to either
  function returns exit code `2` by contract; both tables must agree with
  each other and with `install-skills.sh`'s own platform-executable list
  (the module docblock names Cursor's `cursor-agent cursor` two-binary
  case as the one case where a mismatch would otherwise go unnoticed).
- **Parity tests** — `scripts/__tests__/subagent-parity.test.ts` and
  `scripts/__tests__/skill-artifact-parity.test.ts` assert exact host
  counts and per-host byte-identity against the checked-in `apps/<host>-
  plugin/` trees for the 4 known hosts today. Adding a real host means
  extending these suites' host lists (and, for the subagent generator,
  its `HOST_DIRS` map and the `EMIT_BY_HOST` dispatch with a real
  `emitClaude`/`emitCodex`-shaped renderer for the new host's actual
  frontmatter/config schema — deliberately **not** table-driven, per
  design.md C5's "Not moved" list: per-host string rendering stays
  host-specific code, because byte-identity to a real host's documented
  schema is the whole point).
- **`skills/model-profiles.json`'s `hostDefaults`** — every host needs an
  entry naming which model profile it resolves against by default (all
  four existing hosts currently default to `"balanced"`). `scripts/lib/
  model-profiles.ts`'s `validateRegistry()` fails the build if a host
  known to `HOSTS` (`scripts/lib/model-profiles.ts`, re-exported from
  `host-capabilities.ts`) has no `hostDefaults` entry naming a profile
  that actually supports it — so a new host is registered here in the
  SAME array (`HOSTS` in `model-profiles.ts`) that `host-capabilities.ts`
  re-exports, not a second one. That module also owns the new host's
  effort-string enum (`HOST_EFFORT_ENUM`) — see its own docblock for
  the "no fourth rank, no silent default" precedent to follow.
- **`apps/<host>-plugin/`** — the actual plugin package (its own
  `install.sh`, `package.json`, `.{host}-plugin/plugin.json` manifest,
  and any host-specific MCP registration shape in
  `scripts/install-agents.sh`). This is the "ships" part XP-06
  deliberately stops short of; see the Out of Scope note at the top of
  this document.

## Verification for a real 5th host

The same battery this feature's own generator refactor (T10/T11) used
applies to a real host addition: `bun run scripts/generate-subagent-
artifacts.ts --check` and `bun run scripts/generate-skill-artifacts.ts
--check` must both report no drift for the 4 pre-existing hosts (proving
the new host's addition didn't perturb them), the new host's own files
must be reviewed by hand against its official subagent documentation
(there is no test that can verify a generator's OUTPUT matches a host's
undocumented runtime behavior — only that it matches what was declared),
and `bun run test:scripts` must stay green.

## Related documents

- `.specs/features/cross-pollination-ports/design.md` component C5 — the
  original design for `HostCapabilities` and this document.
- `scripts/lib/host-capabilities.ts` — the capability table itself; read
  its module docblock for the `ownershipMarker` SPEC_DEVIATION and every
  per-host value's inline citation.
- `CLAUDE.md` §Agent-harness surface — the broader generator/installer
  architecture this document's surfaces sit inside.
