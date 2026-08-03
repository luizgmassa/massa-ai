# ai-memory changes: `2a85950..HEAD`

- **Repo**: `/Users/luizmassa/Projects/ai-memory` (GitHub: `akitaonrails/ai-memory`, MIT, Rust workspace)
- **Range**: `2a85950ce8fa5c309fdc3adc481e98a02d824a9f..HEAD`
- **HEAD**: `32e2f594a71acb3cb555efea92255a4a26f3c353` (`32e2f59`)
- **Commit count**: **117 non-merge commits** (185 total incl. 68 merge commits) — see "Methodology correction" below
- **Date span**: 2026-07-20 → 2026-07-29 (10 days)
- **Diffstat**: 156 files changed, **+22,240 / -4,054**
- **Contributors** (non-merge commits): AkitaOnRails/Fabio Akita 76, Lucas Oliveira 13, Samir Hanna Verza 6, Welington 3, iagogfe 3, klebervirgilio 3, milesibastos 3, Bruno Miiller 2, Marcelo Mogami 2, Thiago Zanluca 2, lhzapata 2, Marcelo7889 1, zapatal 1 — a community-PR-plus-maintainer-review project; several commits are explicit adversarial-review follow-ups to a prior PR (e.g. `3fe60ec` follows `3d8b9b4`).
- **Releases landed in range**: v1.17.2, v1.17.3, v1.18.0, v1.19.0, v1.19.1, v1.19.2. Two further fixes (#292, #294) sit in `[Unreleased]` at HEAD, not yet released as of `32e2f59`.
- **Report date**: 2026-07-29

## Methodology correction

The task brief stated the range holds "~50 commits." A first raw `git log ... | wc -l` in this session returned exactly `50` — but that output was **silently truncated** (later cross-checks showed it was missing everything before `2026-07-25`). This was caught and corrected via three independent, mutually agreeing methods: `git rev-list --no-merges --count` (117), and `grep -c '^=====$'` on two independently-generated dump files (117 and 117). The true range is **117 non-merge commits / 185 total (68 merges)**. All findings below are enumerated against the full 117-commit set.

A second integrity issue surfaced mid-investigation: this environment transparently routes Bash calls through an `rtk` proxy (a token-optimization CLI hooked into `PreToolUse`), which was found to **silently compact `git show`/`git diff` output** in three of the seven parallel sub-investigations (independently discovered and corrected by each). The orchestrator's own direct evidence (diffstat, numstat, full commit log with bodies, `CHANGELOG.md`/`README.md`/`AGENTS.md` diffs) was cross-verified byte-for-byte against `rtk proxy` (guaranteed raw) output and found **identical** — no corruption on the orchestrator's own captures. All cited evidence below was either re-verified via `rtk proxy` (raw) or read directly via file reads, never trusted from a single unverified filtered command.

---

## Executive summary

- Range is **117 non-merge commits**, not ~50 — verified via three independent methods after an initial truncated count (see above).
- Assistant/Stop capture privacy hardening landed as a deliberate 3-PR arc tied to tracking issue **#196**: default-off raw-field strip (no behavior change) → double opt-in sanitized+capped capture → session-reviewer scoring of non-empty Stop excerpts. Each stage shipped with dedicated regression tests, including one that traces a sentinel through the *entire* downstream surface (storage, FTS, session page, handoff, wiki checkpoint, and the LLM reviewer's actual prompt).
- The sanitization boundary became **type-enforced**: `Writer::insert_observation` now takes `Sanitized<NewObservation>`, whose only public constructor is `Sanitized::new(value, &sanitizer)` — an unsanitized observation cannot reach disk by construction, not by convention.
- Universal lifecycle-body size caps were added for the 3 of 7 event kinds (`UserPrompt`, `Notification`, `PostCompaction`) that previously had **no cap at all** — closing an unbounded-persistence gap now backstopped everywhere by a 16 KiB ceiling at the type-safe sanitization boundary itself.
- Two new managed-harness (`ai-memory run <agent>`) adapters shipped: **Kimi Code** (handoff must ride `UserPromptSubmit`, not `SessionStart`, because Kimi discards SessionStart hook stdout — verified against kimi-code v0.28.1/v0.29.0 source) and **Grok Build CLI** (context delivered via native `--rules` flag, since Grok also discards SessionStart stdout and its UserPromptSubmit hook is passive).
- `.ai-memory.toml` marker-based scope resolution was **unified across every CLI command**: before, only lifecycle hooks read the marker, so a checkout declaring `workspace = "acme"` had captures land in `acme` while `run`/`bootstrap`/`search`/`write-page`/etc. all silently resolved to `default` — splitting one repository's memory across two scopes (PR #259).
- `purge-project`'s new live-run guard was itself found incomplete on adversarial review: it checked `managed_runs.state = 'active'` without checking `lease_expires_at`, so a SIGKILL'd/OOM'd agent left a permanently-blocking stale-but-"active" row (`3fe60ec` follow-up to `3d8b9b4`).
- Idempotent hook ingest via a UUID `ingest_key` baked into the spooled URL at mint time, claimed atomically with the observation insert (new `V33` migration) — revised once mid-range (`2a771a3`) from "skip the whole replay on retry" to "**resume** interrupted downstream effects" after realizing a crash between claim-commit and side-effects could otherwise strand a claimed-but-never-actually-run event.
- SessionEnd reliability chain (3 commits, deepest mechanism in the range): a durable, generation-keyed consolidation job queue outside the hook request (`6b3aedb`, new `session_consolidation_jobs` table/`V34`) → a watermark/observation-count comparison replacing a wall-clock comparison vulnerable to clock skew (`5a124fe`, new `V35`) → convergent idempotent recovery that replays every downstream tail-effect as a safe no-op on a duplicate SessionEnd delivery (`188b6ed`).
- A large (~44-file, +5227/-2285) code-audit-remediation refactor (`cb37a7f`) relocated server machinery **out of the CLI crate**: axum auth middleware → `ai-memory-mcp`, web-UI mounting/HTML injection → `ai-memory-web` (new `mount.rs`, 1,201 lines), auto-improve scheduler orchestration → `ai-memory-consolidate` — plus 52 new tests and 4 confirmed dead-code removals (a 5th, `ManagedHarness::from_name`, was claimed removed but is **still live at HEAD**, contradicting the commit's own description).
- Retrieval gained a bounded "source authority" adjustment (canonical page-kind, `pinned`, and a fixed tag vocabulary) applied **after** FTS5+graph+vector candidate generation, plus a follow-up perf fix reusing FTS-derived authority metadata instead of a second query, and two correctness fixes to keep FTS/vector/graph candidate windows aligned.
- The M8 access-counter reinforcement (`access_count`/`last_accessed_at` bump on every search hit) was throttled to at most **once per page per minute**, closing a burst-search-floods-the-single-writer-actor defect.
- A new opt-in **Claude session-aware MCP bridge** (`ai-memory mcp-bridge`, hidden subcommand) forwards `CLAUDE_CODE_SESSION_ID` as a custom `X-Memory-Actor-Session-Id` header, letting `[auto_scope] mode = "per_session"` work for concurrent Claude Code windows against a single static MCP registration otherwise unable to tell sessions apart.
- `CLAUDE_CONFIG_DIR` relocation was fixed **independently, three times** — once each for `install-mcp`, `install-hooks`, `install-skills` — because no shared config-path resolver existed yet; `uninstall` had to learn to sweep both the relocated and default paths so enabling the variable never orphans a prior install.
- New `ai-memory completions <shell>` subcommand generates shell completions from the binary's own `clap`-derived command tree (never vendored/checked in) so the script can never drift from the CLI surface that produced it.
- The Docker CLI wrapper (`bin/ai-memory`) had **four separate** stdin/TTY/pipe defects fixed across the range (SELinux relabeling, completion-pipe-closure exit codes, empty-args on macOS bash, and — the most serious — stdin attached only on a real terminal, silently discarding `write-page --body -` input while still reporting success).
- Antigravity CLI hook-capture support was fixed **twice**: first added native-tool recognition (`94e0f5c`) but broadened a shared extraction helper too far, causing a failed-edit-shows-attempted-content regression and a cross-event-type content leak; then narrowed to a purpose-built, agent-and-tool-scoped fallback (`6451beb`) that also walked back three unverified tool-family/path-key guesses back to fail-closed `Unknown`.
- The OpenAI-compatible LLM provider's structured-output mode was flipped to schema-constrained (`response_format=json_schema`) **by default**, paired with widening the tolerant-fallback error classifier to catch exactly the new failure mode this default flip introduces (explicit 400/422 rejections naming the field) without swallowing unrelated provider errors.
- `install-hooks --project-strategy` semantics changed from "unset ⇒ `basename`" to "unset ⇒ preserve whatever a prior `--apply` baked in" — closing a defect where `ai-memory upgrade`'s bare re-apply silently reverted a chosen `repo-root` strategy back to `basename`.

---

## Architecture / capability changes

### Genuinely new source files (created within this range)

| File | Role |
|---|---|
| `crates/ai-memory-hooks/src/assistant_capture.rs` | Closed per-agent/event field table for raw-message stripping (`strip_assistant_message_raw`) plus the sanitized+capped `AssistantCaptureProtocol` capture path. |
| `crates/ai-memory-cli/src/marker.rs` | Extracted `.ai-memory.toml` marker reader (pulled out of `commands::hook_capture`) plus `commands::resolve_scope`/`resolve_workspace`, the single scope-resolution entry point every CLI command now calls. |
| `crates/ai-memory-cli/src/commands/mcp_bridge.rs` (302 lines) | `ai-memory mcp-bridge` — a session-aware stdio↔HTTP MCP proxy for Claude Code (dual `rmcp` role: `RoleServer` over stdio downstream, `RoleClient` over HTTP upstream), injecting `X-Memory-Actor-Session-Id`. |
| `crates/ai-memory-store/src/session_consolidation.rs` (626 lines) | Durable, generation-keyed job queue for opt-in SessionEnd LLM consolidation: `enqueue`, `claim_next` (lease-fenced), `complete`/`fail`/`release`. |
| `crates/ai-memory-consolidate/src/embed.rs` (174 lines) | Single embedding-backfill implementation shared by the scheduler tick and the `/admin/embed` HTTP path (previously two independent, drifted copies). |
| `crates/ai-memory-consolidate/src/auto_improve_schedule.rs` (549 lines) | Auto-improve scheduler orchestration, relocated out of `ai-memory-cli`'s `serve.rs`. |
| `crates/ai-memory-llm/src/stored_token.rs` (227 lines) | Generic `StoredOAuthToken<E>` envelope + shared `refresh_grant` helper unifying `OidcToken`/`OpenAiOAuthToken`. |
| `crates/ai-memory-web/src/mount.rs` (1,201 lines) | Web-UI mounting, `<base href>`/meta HTML injection, path-prefix normalization — relocated out of `ai-memory-cli`'s `serve.rs`. |
| `crates/ai-memory-mcp/src/auth.rs` | Axum bearer-auth middleware, relocated out of `ai-memory-cli` (pure rename, 0/0 diff: `crates/{ai-memory-cli=>ai-memory-mcp}/src/auth.rs`). |
| `crates/ai-memory-cli/src/commands/completions.rs` | `ai-memory completions <shell>` implementation (buffers output before writing, since `clap_complete` panics on a write error to a closed pipe). |
| `crates/ai-memory-store/migrations/{V33__ingest_keys,V34__session_consolidation_jobs,V35__session_end_observation_watermark}.sql` | See Fixes/Dependencies sections. |
| `crates/ai-memory-cli/tests/{marker_scope,completions}.rs`, `crates/ai-memory-consolidate/tests/embed_backfill.rs` | New test files backing the above. |
| `hooks/kimi-code/{session-start,user-prompt-submit}.{sh,ps1}`, `docs/shell-completions.md`, `crates/ai-memory-core/src/routing_skills/ai-memory-retrieval/SKILL.md` | New per-integration hook scripts and docs. |

**Correction (verified by two independent sub-investigations against `<sha>^` parent content)**: several files that a naive full-range `git diff --numstat` reading suggests are "new" (0 deletions, large insertion count) are **not**. `crates/ai-memory-consolidate/src/curator.rs` (279→950 lines), `crates/ai-memory-store/src/migrations.rs`, `crates/ai-memory-llm/src/auth_file.rs` (112→280 lines), and `crates/ai-memory-llm/src/opencode.rs` (62→80 lines) all pre-date this range and were purely extended, not created. `crates/ai-memory-cli/src/commands/mod.rs` has existed since commit `836d8e6`, long before this range — `e3c3314` adds exactly one line to it (`pub mod mcp_bridge;`). Numstat alone (insertions with zero deletions) is not sufficient evidence a file is new; it only proves the file received no deletions in the diffed range, which is equally consistent with a pre-existing file that was purely extended.

### Crate-boundary shift ("thin CLI, fat crates")

`cb37a7f`'s refactor is a real architecture change, not a pure cleanup. `crates/ai-memory-cli/src/commands/serve.rs` shrank **3,864 → 2,202 lines** (-1,662 net; raw numstat 155/1817 for that one file). Three concerns moved to the crate that actually owns the domain:

| Moved out of `ai-memory-cli` | Destination | Cargo.toml evidence |
|---|---|---|
| axum bearer-auth middleware (`AuthState`, `require_bearer`) | `ai-memory-mcp/src/auth.rs` | `ai-memory-mcp/Cargo.toml` **adds** `subtle, base64, getrandom` with a comment naming exactly why ("HTTP auth middleware: constant-time token compare, Basic-header decoding, random token generation"); `ai-memory-cli/Cargo.toml` **drops** `subtle, getrandom`. |
| Web-UI mounting + HTML injection | `ai-memory-web/src/mount.rs` (new) | `ai-memory-web/Cargo.toml` adds `tower, tower-http`. |
| Auto-improve scheduler orchestration + proposal staging/approval types | `ai-memory-consolidate/src/auto_improve_schedule.rs` (new) | New file imports types (`ApproveAutoImproveProposalResult`, `NewAutoImproveProposal`, `StageAutoImproveRun`) that vanished from `serve.rs`'s own `ai_memory_store` import list (9 named types → 3: `ReaderPool, Store, WriterHandle`). |

**Stays in `ai-memory-cli` on purpose**: `apply_http_layers`/`require_allowed_host`/`host_allowed` (Host-header allowlist — deployment/operator config, not domain logic) and `auth_bearer.rs` (the CLI's *outbound* OIDC/OAuth client talking *to* the server — a different concern from the *inbound* middleware that moved).

**Doc-drift finding**: the task brief expected `docs/ARCHITECTURE.md` to state this crate-boundary invariant in the same commit — verified there is **no such diff**; `git show cb37a7f --stat -- docs/ARCHITECTURE.md` is empty. The doc's current crate-layout table pre-dates this commit and, as of HEAD, **still omits `ai-memory-web` from the crate list entirely** — a genuine, still-open documentation gap, not evidence the invariant was ever written down for this specific change.

### New transports / managed harnesses

- **Kimi Code managed harness** — full `ai-memory run kimi` adapter: launch semantics (Kimi rejects caller-chosen ids for fresh sessions; only `--session <id>` resumes a linked one), read-only transcript import from `agents/main/wire.jsonl` (event ids = SHA-256 of the raw journal line, survives fork/compaction rewrites), and handoff/briefing delivery moved to `UserPromptSubmit` because Kimi discards `SessionStart` stdout (verified against kimi-code v0.28.1 source `packages/agent-core/src/session/index.ts`, later v0.29.0 for the full contract).
- **Grok Build CLI managed harness** — context delivered through Grok's native `--rules` flag (system-prompt append) rather than a hook, because Grok also discards SessionStart stdout and its UserPromptSubmit hook is passive; transcript import reads `chat_history.jsonl` with a prefix-validated cursor; Grok's harness-scaffolding leak into the ledger (environment block + Claude-style `<system-reminder>` blocks stored in `user` records) was measured precisely and fixed (`d4585a5`): one captured session went from 5 events/42,984 bytes to 2 events/327 bytes; a live acceptance round trip went from 43,430 bytes of Grok events to 1,017.
- **Claude session-aware MCP bridge** (`ai-memory mcp-bridge`) — see Features below.

---

## Features added

### 1. Opt-in assistant/Stop capture (tracking issue/PR arc `#196`)

- **What**: lets a Claude Code `Stop` event carry a sanitized, size-capped excerpt of the assistant's final turn, for session-review/consolidation purposes.
- **Where**: `crates/ai-memory-hooks/src/assistant_capture.rs` (protocol + strip/scrub/cap logic), `crates/ai-memory-cli/src/commands/hook.rs` (client transform), `crates/ai-memory-hooks/src/router.rs:489,641` (`handle_hook`/`handle_hook_batch` server-side backstop), `crates/ai-memory-cli/src/commands/install_hooks.rs` (`capture_assistant_allowed` gate), `hooks/claude-code/stop.sh` + `hooks/lib/ai-memory-hook.ps1` (script-fallback fail-closed drop).
- **How**: shipped in 3 deliberate stages. (1) `fe404c0` — unconditionally strip the raw `last_assistant_message` field at 4 choke points (client pre-spool, drain-replay of legacy entries, both server hook handlers) with **no behavior change**, since the field was already never persisted. (2) `f28029c` — reintroduce capture behind a **double opt-in**: server `capture_assistant`/`AI_MEMORY_CAPTURE_ASSISTANT` AND client `install-hooks --agent claude-code --capture-assistant`; client scrubs with `Sanitizer::builtin()` **before** truncating to 2,000 bytes UTF-8-safely, server independently re-scrubs and re-caps (never trusts client length), wire protocol is `AssistantCaptureProtocol{version,excerpt}` with `#[serde(deny_unknown_fields)]` under body key `_ai_memory_assistant`. (3) `f06dda4` — session-reviewer's `observation_score()` scores a non-empty `Stop` at 88 (between `PreCompact`=90 and `PostCompaction`=85) instead of the flat empty-Stop prior of 55, so a captured excerpt can compete for a sampling slot without herding out `UserPrompt`=100.
- **Depends on**: `crates/ai-memory-core/src/sanitize.rs`'s `Sanitizer`; the type-enforced `Sanitized<NewObservation>` boundary (see Fixes).
- **Gated**: off by default; requires both opt-ins. Script-fallback installs (Docker wrapper, `AI_MEMORY_HOOK_PLATFORM=posix`) cannot sanitize and drop the whole Stop event rather than forward it raw.

### 2. Shell completions (`21b70d8`, `f4218a3`, `a2ee96b`)

- **What**: `ai-memory completions <shell>` for bash/zsh/fish/PowerShell/elvish.
- **Where**: `crates/ai-memory-cli/src/commands/completions.rs`, `docs/shell-completions.md`.
- **How**: generates from the binary's own `clap_complete`-derived `Command` tree — nothing vendored/checked in, so it cannot drift from the shipped CLI. Runs in the pre-config fast path (works before `ai-memory init`, no data directory needed). Renders to a buffer before writing because `clap_complete` panics (`.expect()`) on a write error, which would otherwise surface as a raw panic instead of a silent exit when piped into e.g. `head`. `a2ee96b` additionally fixes the Docker wrapper to buffer the generated script before streaming it, so a short-lived downstream consumer's broken pipe doesn't surface Docker's own error.
- **Depends on**: new `clap_complete = "4"` dependency (`Cargo.toml`).
- **Gated**: always available, no opt-in.

### 3. Kimi Code managed harness (`33f9808`, `a4b02af`, `9e36197`, `6a03336`, `9e48d0d`, `e2f5af9`, `0736660`, `673093d`, `6f9c894`, `260af15`, `af29f57`, `526f4bd`; docs `23e1f9b`, `96441fa`, `d72f31b`)

- See Architecture section above for the mechanism. Joins the automatic bare-`ai-memory run` harness pool (`9e36197`); accepts `kimi`, `kimi-code`, `kimi-cli` aliases (`af29f57`).
- **Depends on**: `crates/ai-memory-workstream/src/{harness,transcript}.rs`, `crates/ai-memory-hooks/src/workstream.rs`.
- **Gated**: opt-in via `ai-memory run kimi`; direct `kimi` launches are unaffected.

### 4. Grok Build CLI managed harness (`9c6a2ab`, `d4585a5`, `4032802`)

- See Architecture section above. Stays **out of** the bare-mode automatic pool (explicit `ai-memory run grok`/`grok-build` only). Verified against Grok Build CLI v0.2.111.
- **Gated**: opt-in via explicit invocation only.

### 5. Idempotent hook ingest (`fc8846d`, `2a771a3`, `fd2881c`)

- **What**: a retried spool entry (lost HTTP response after the server already processed it) no longer duplicates the observation or a session-end auto-handoff.
- **Where**: `crates/ai-memory-store/migrations/V33__ingest_keys.sql`, `crates/ai-memory-store/src/ops.rs` (`insert_observation_keyed`, `IngestObservationOutcome{Inserted,ResumePending,AlreadyComplete}`, `complete_observation_ingest`), `crates/ai-memory-hooks/src/router.rs:1992-2035` (new `IngestGates: HashMap<(ProjectId,String), Weak<Mutex<()>>>`, bounded at 4096, serializes an overlapping retry against the original processor for the *entire* side-effect pipeline).
- **How**: each event mints a UUID `ingest_key` once at spool time, baked into the spooled URL so every retry resends the same key (1-64 ASCII token chars, else silently degrades to "absent," never a 4xx). The server claims the key inside the same SQLite transaction as the observation insert. Revised mid-arc (`2a771a3`): the first cut (`fc8846d`) claimed the key *before* running wiki/handoff/log side effects, so a crash between claim-commit and those effects meant a retry saw "already claimed" and skipped work that never actually ran; the fix adds a `completed_at` marker and a 3-way outcome so a `ResumePending` retry **resumes** the downstream effects instead of skipping them. Keys expire opportunistically after 30 days via an indexed delete piggybacked on keyed inserts (no scheduler job). The `V33` schema itself was rewritten in place between the two commits — verified **safe** because both commits land before the `v1.18.0` release tag (`504f5c9`), so no shipped build ever saw the intermediate schema.
- **Depends on**: the single-writer SQLite actor; project-scoped key namespace (a duplicate key in a different project does not cross-suppress, per a dedicated test).
- **Gated**: transparent/always-on; backward compatible both ways (old server ignores the unknown query param; old client sends no key and keeps prior at-least-once behavior).

### 6. Durable SessionEnd consolidation queue (`6b3aedb`)

- **What**: opt-in LLM consolidation work at SessionEnd moves out of the blocking hook request into a durable, retryable background queue.
- **Where**: `crates/ai-memory-store/src/session_consolidation.rs` (new), `crates/ai-memory-store/migrations/V34__session_consolidation_jobs.sql` (new), `crates/ai-memory-cli/src/commands/serve.rs` (`run_session_consolidation_worker`).
- **How**: `enqueue()` inserts keyed by `(session_id, generation)` where generation = the observation count at enqueue time (`INSERT OR IGNORE ... HAVING COUNT(o.id) > 0`), so a duplicate SessionEnd is naturally idempotent and a stale pending job is superseded rather than run twice. `claim_next()` atomically claims the oldest due job (including one whose lease expired) via a conditional `UPDATE ... WHERE state=... AND (...)`; `complete`/`fail`/`release` are all lease-fenced (`WHERE state='running' AND claim_id=?`). Worker: poll every 15s, 10-minute lease, exponential backoff (`30s * 2^(attempt-1)`, capped at exponent 4 = 480s), max 5 attempts before terminal `fail`; on graceful shutdown, `release` returns the lease **without** spending an attempt. A `BEFORE INSERT` trigger on the new table raises `ABORT` if the row's workspace/project don't match the referenced session's — a DB-level scope-integrity guard, not just an app-level check.
- **Depends on**: `HookState.session_consolidation_notify` (a `notify_one()` wakeup — "the database is the queue; notifications only reduce pickup latency").
- **Gated**: only spawned when `config.consolidate_on_session_end && consolidator.is_some()` (i.e., the pre-existing opt-in flag plus a configured LLM provider).

### 7. Retrieval source-authority ranking (`2ffcf84`, `f5ef752`, `c41c1b8`)

- **What**: a bounded relevance adjustment favoring maintained/canonical pages over closely-matching episodic evidence, applied after candidate generation.
- **Where**: `crates/ai-memory-store/src/reader.rs`, `docs/ARCHITECTURE.md`, `docs/vector-backend-policy.md`.
- **How**: after FTS5 + graph-neighbor RRF + optional vector RRF generate candidates, a multiplier considers canonical page-kind classification, tier (semantic/procedural), `pinned`, and an explicit tag vocabulary (`canonical`/`active`/`source-of-truth` boost; `superseded`/`historical`/`test-fixture`/`do-not-answer-from` downgrade) — deliberately not an independent retriever or a hard filter, so a targeted session-specific query still finds that session. `f5ef752` (perf) reuses authority metadata already available from the FTS query instead of a second per-candidate lookup.
- **Depends on**: the pre-existing tier/pinned/tag frontmatter model.
- **Gated**: always-on for both FTS-only and hybrid (vector-enabled) search paths; no config flag.

### 8. Claude session-aware MCP bridge (`e3c3314`, fixed by `5405cc7`)

- **What**: a hidden `ai-memory mcp-bridge` subcommand — a stdio↔HTTP MCP proxy that stamps every upstream call with the current Claude Code session id.
- **Where**: `crates/ai-memory-cli/src/commands/mcp_bridge.rs` (new, 302 lines), `crates/ai-memory-cli/src/commands/install_mcp.rs` (`--session-aware` flag, `build_mcp_entry` stdio-shaped registration), `crates/ai-memory-cli/src/commands/uninstall.rs` (`has_session_bridge` recognition).
- **How**: one process plays both `rmcp` roles — `RoleServer` over `stdio()` downstream to Claude Code, `RoleClient` via `StreamableHttpClientTransport` upstream to the real HTTP MCP server — passing every `list_tools`/`call_tool` straight through, adding one custom header `X-Memory-Actor-Session-Id` read from the bridge's own inherited `CLAUDE_CODE_SESSION_ID` env var. Fails closed (`run()` hard-errors) if that env var is absent — "this bridge must be launched by Claude Code as an stdio MCP server," no silent standalone fallback. `bin/ai-memory`/`bin/ai-memory.ps1` were updated (+1 line each) to forward `CLAUDE_CODE_SESSION_ID` into the Docker wrapper's helper container. `5405cc7` fixed a downstream break: `rmcp` 1.8's `peer_info()` return type differs from 1.7's, breaking only the unlocked `cargo install --path` install method; fixed with a `.map(|info| (*info).clone())` shim, plus a permanent CI regression guard — a new `source-install` job that intentionally runs `cargo install --path` **without** the lockfile (the only CI job in the repo that does this on purpose).
- **Depends on**: the pre-existing `[auto_scope] mode = "per_session"` server-side routing.
- **Gated**: strictly opt-in via `install-mcp --client claude-code --session-aware`; default `--client claude-code` registration is unchanged (static `type:"http"`, bearer header).

### 9. GET /admin/open-sessions + finalize-session as a thin HTTP client (`cb37a7f`, PR #236)

- **What**: a new endpoint listing open (not yet ended) sessions for a scope; `finalize-session` now calls it over HTTP instead of opening the local SQLite index directly.
- **Where**: `crates/ai-memory-mcp/src/admin.rs::handle_open_sessions`, `crates/ai-memory-cli/src/commands/finalize_session.rs`.
- **How**: delegates to a pre-existing reader method (`open_sessions_for_scope_agent`) — no new store capability, just a new HTTP door onto an existing one. Query params: `{workspace, project, agent, all}` (`all=false` default → newest-only).
- **Note**: this is also a **capability regression** — see Deletions and reversals.
- **Gated**: always-on; no flag.

### 10. `--fresh` / orphaned native-session recovery (`504a895`, PR #240)

- **What**: `ai-memory run <harness>` verifies a linked native-session resume target still exists before attempting to resume it.
- **Where**: `crates/ai-memory-workstream/src/transcript.rs::native_session_exists`, `crates/ai-memory-cli/src/commands/run.rs::build_preflighted_launch_plan`.
- **How**: a 3-way check (`Ok(true)`/`Ok(false)`/`Err`) against the harness's own read-only store: a confirmed-absent id (`Ok(false)`) discards the resume target and starts fresh, repointing the workstream when the new session is observed; an inconclusive/unreadable store (`Err`) is treated conservatively — keeps the resume attempt, just warns. New `--fresh` flag forces the fresh-start path unconditionally and is a hard error combined with any explicit native resume/session/fork selector.
- **Gated**: automatic recovery is always-on; `--fresh` is an explicit opt-in override.

### 11. CLAUDE_CONFIG_DIR relocation support (`aab94b5`, `4760311`, `4efe608`, `2d699f7`)

- **What**: `install-mcp`, `install-hooks`, `install-skills`, and `uninstall` all honor `CLAUDE_CONFIG_DIR` when Claude Code relocates its config directory.
- **Where**: `crates/ai-memory-cli/src/commands/{install_mcp,install_hooks,install_skills,setup_agent,uninstall,path_util}.rs`.
- **How**: three independent fixes (no shared resolver existed at the time) — MCP registration path (`$CLAUDE_CONFIG_DIR/.claude.json`), hooks settings path (`$CLAUDE_CONFIG_DIR/settings.json`), and the global skills root (`$CLAUDE_CONFIG_DIR/skills`) each needed their own env-var-aware resolution; `uninstall` checks both the relocated and default paths so enabling the variable never leaves a stale prior-path registration behind. `--config-file` remains the strongest override; dry-run output prints the resolved path instead of a hardcoded one.
- **Gated**: automatic based on the env var being set (non-empty); no flag needed.

---

## Fixes

### High-density defect mechanisms (subsections)

#### `.ai-memory.toml` scope resolution unified across every CLI command — `3d8b9b4`, `3fe60ec`, `f69e896` (PR #259)

- **Defect**: only lifecycle hooks read the `.ai-memory.toml` marker. Every other scope-taking command (`run`, `bootstrap`, `search`, `write-page`, `purge-project`, `move-project`, etc.) resolved into `default` regardless — the same repository split across two scopes, with `ai-memory run`'s managed workstream stranded on the wrong side.
- **Fix**: new `crates/ai-memory-cli/src/marker.rs` (extracted marker reader) + `commands::resolve_scope`, resolving `workspace` and `project` **independently**, each falling back: explicit CLI flag → marker → previous default. `--workspace`/`--project` args become `Option<String>` so an explicit `--workspace default` is distinguishable from unset. When the marker decides a field, the command announces the resolved scope on stderr (`ai-memory: scope acme/api (workspace + project from /path/.ai-memory.toml)`). `AI_MEMORY_IGNORE_MARKER=1` reverts to pre-fix resolution for one invocation (client commands only — hooks always honor the marker). `ai-memory serve` is deliberately excluded (no caller cwd; its flags are the baked fallback for hook events).
- **Adversarial-review follow-up (`3fe60ec`)** found 4 more defects in the same change: (1) the purge-guard checked `managed_runs.state='active'` without checking `lease_expires_at`, so a SIGKILL/OOM-killed agent left a permanently-blocking stale row (fixed: require the lease to also be in the future); (2) `copy_purge_merge` passed `force:false` into the now-fallible `purge_project` but mapped the error through `internal_err`, turning a legitimate 409 into a 500 *after* already copying every page (half-applied merge presented as a server fault; fixed to return 409 naming pages already copied); (3) `embed --force` without `--project` resolved a project name it then discarded, risking failure on a non-git cwd (fixed via a new `resolve_workspace` that resolves only the half it needs); (4) `AI_MEMORY_IGNORE_MARKER`/`AI_MEMORY_PROJECT_STRATEGY` moved into a `RuntimeEnv` struct because AGENTS.md invariant #1 (`Config::load()` is the only allowed `std::env::var` call site) was being violated, and a subprocess test's `$HOME` boundary check was silently broken by a macOS `/var` vs `/private/var` symlink mismatch between `TempDir::path()` and the child's `getcwd()` (fixed by canonicalizing tempdirs and clearing `AI_MEMORY_HOME`, which outranks `$HOME`).
- **Guard tests**: `crates/ai-memory-cli/tests/marker_scope.rs` (new file); a table-driven scope-resolution suite in `scope.rs` covering partial scope, missing explicit scope, active-project precedence, cross-workspace isolation.

#### SessionEnd reliability chain — `6b3aedb` → `5a124fe` → `188b6ed` (PRs #265, #268, #271)

- **`5a124fe` defect**: `session_end_disposition` decided whether to re-run SessionEnd processing by comparing `observations.created_at > sessions.ended_at` — a wall-clock comparison. Any observation whose stored `created_at` ended up permanently ahead of `ended_at` (clock skew, NTP correction) made every future duplicate SessionEnd delivery see "newer than zero" forever, repeatedly re-consolidating a session with zero real new activity. **Fix**: new `V35` migration adds `sessions.ended_observation_count` (backfilled at migration time so upgrades don't create catch-up work); `end_session` stamps it in the same `UPDATE` as `ended_at`; disposition now compares `current_observation_count > ended_observation_count` — a pure monotonic-integer comparison, no timestamps involved. Guard test proves both directions with manually corrupted `created_at` values.
- **`188b6ed` defect** (two parts): (1) one `DropStale` enum case covered both "missing/mismatched session" and "genuinely already-ended, no new work" — a mismatched/missing SessionEnd could wrongly trigger consolidation-recovery logic; split into `DropInvalid` (drop, no recovery) vs. `AlreadyEnded` (runs recovery). (2) the non-managed SessionEnd write sequence was four separately-committed steps (`end_session` → `insert_handoff` → wiki git commit → enqueue consolidation) — a crash between any two could strand a session as "ended" with no handoff, an uncommitted wiki file, or a permanently-pending ingest key. **Fix**: new `end_session_with_handoff` wraps the end-stamp and handoff insert in one transaction; the `AlreadyEnded` branch now replays three idempotent repair actions on every duplicate delivery (wiki commit-if-dirty, generation-idempotent consolidation enqueue, `complete_observation_ingest_if_claimed`) so repeated recovery **converges** on the same fully-repaired end state rather than double-committing or silently doing nothing.
- **Guard test**: `stale_session_end_redelivery_converges_interrupted_tail_effects` manually reproduces the exact crash window, then asserts a real duplicate SessionEnd converges all three effects exactly once.

#### SessionStart atomic claim — `06b2099` → `ea354e6` (PR #235)

- **`06b2099` defect**: the managed-run branch of `fetch_and_accept_handoff` returned early on any managed-run query param, skipping the `latest_open_handoff` read entirely — a session launched by `ai-memory run` never consumed a handoff a previous session left for it (the slot is single-use; nothing else picks it up). **Fix**: extract `fetch_managed_context`, which now always falls through to handoff+brief resolution instead of exiting the request.
- **`ea354e6` defect**: that fix still left each side-effect (`accept_managed_run_context`, `accept_handoff`) as an independent, immediately-committed write interleaved with fallible steps — a later failure could swallow the response into an empty 200 (router.rs `handle_handoff`) *after* a claim had already committed server-side, burning a single-use resource with no delivery. **Fix**: `fetch_managed_context` becomes read/render-only; one writer call (`accept_startup_context`) wraps **both** claims in a single SQLite transaction, executed only after every fallible read/render has already succeeded; if the managed claim fails, the transaction returns before even touching the handoff row.
- **Guard test**: `startup_context_claim_is_atomic_and_single_use` asserts a failed managed claim rolls back the handoff transition too.

#### Antigravity CLI capture — added, then regression, then narrowed — `94e0f5c` → `6451beb` (PR #294)

- **`94e0f5c` defect**: Antigravity CLI's native tools (`view_file`, `replace_file_content`, `multi_replace_file_content`, `write_to_file`, `list_dir`, `grep_search`, `read_url_content`, `read_resource`, `call_mcp_tool`) all fell through `capture_policy::family()`'s classifier to `ToolFamily::Unknown`, which made `safe_tool_body()` discard all content — every Antigravity file/search observation rendered empty, leaving session-end consolidation nothing to summarize. **Fix (part 1)**: add all 9 tool names to the classifier plus 3 new path-argument keys (`TargetFile`, `SearchPath`, `DirectoryPath`). **Fix (part 2)**: Antigravity's post-tool-use payload never sends a top-level `tool_response`/`output`/`result` field — written content instead nests under `toolCall.args` (`CodeContent`, `ReplacementContent`, `ReplacementChunks`) — fixed by generalizing the shared `extraction_candidates()` helper to *unconditionally* also search that nested location, for every agent and call site.
- **Regression introduced**: broadening the *shared* helper (rather than scoping the fix to Antigravity+edit-tools) caused two proven bugs: (1) a **failed** edit whose `args` still contained the never-written attempted content would render that content as if it had succeeded, hiding the real error (priority-order bug: content-lookup ran before the `error` fallback); (2) the args-lookup could pick up nested content on **unrelated event types** (e.g. a `notification`) for **any** agent, not just Antigravity edit tools (blast-radius bug, from adding it to a helper every extraction site shares).
- **`6451beb` fix**: reverts `extraction_candidates()` to its pre-`94e0f5c` form; adds a narrow, purpose-built `antigravity_edit_content()` gated on `agent==AntigravityCli AND tool_call.name` in the 3 known edit tools, called only as the *last* fallback after `error`. Also walks back unverified guesses: `read_url_content`/`read_resource`/`call_mcp_tool` revert to fail-closed `Unknown`, and `SearchPath`/`DirectoryPath` are dropped from `direct_paths()` (keeping only the verified `TargetFile`) — an unrecognized path-argument key means a `[capture] ignore_paths` exclusion silently fails to match, a worse failure mode (content leaks past an exclusion) than simply not capturing content.
- **Guard tests**: `antigravity_failed_edit_prefers_error_over_attempted_content`, `antigravity_generic_tools_and_unrelated_events_fail_closed`.

#### Install symlink + project-strategy preservation — `866e535`, `2e82264`, `7fa2f87`, `6d2c229` (PRs #264, #267)

- **`866e535`/`2e82264` defect**: `install-hooks --apply` wrote config via sibling-tempfile-then-rename, which **replaces** a symlinked target (e.g. a dotfiles-managed `~/.claude/settings.json`) with a regular file, silently breaking the symlink and leaving the real file untouched. **Fix**: resolve the symlink first, write through to the file it points at, keep the link intact.
- **`7fa2f87`/`6d2c229` defect**: `--project-strategy` defaulted to `basename` when not explicitly passed, so a bare re-apply — notably the auto-refresh inside `ai-memory upgrade` — silently reverted a previously-chosen `repo-root` strategy back to `basename`. **Fix**: the flag becomes `Option<...>` where "unset" now means "preserve whatever an earlier `--apply` baked in"; an explicit value (including `basename`) still honors an intentional downgrade; resolved once up front so every per-agent renderer picks it up uniformly.

#### Docker wrapper stdin/TTY (`bin/ai-memory`, `bin/ai-memory.ps1`) — `bc26d9c`, `a2ee96b`, `022638d`, `39531f9`, `0055407` (PRs #212, #243)

| Commit | Defect | Fix |
|---|---|---|
| `bc26d9c` | SELinux-enforcing hosts refused writes into the whole `$HOME` bind mount. | Detects SELinux-enforcing host + daemon and adds `--security-opt label=disable` only to short-lived helper commands that write bind-mounted host files — not the long-lived server container. |
| `a2ee96b` | Piping `ai-memory completions <shell> \| head` surfaced Docker's own broken-pipe error/non-zero exit instead of the native command's actual success. | Wrapper buffers generated completions before streaming to stdout. |
| `022638d` | Empty-args invocation broke on macOS's bash. | Fixed empty-args handling in the wrapper script. |
| `39531f9`, `0055407` | Wrapper only passed `-it` when stdin **and** stdout were both a terminal — every piped/redirected invocation reached the container with a **closed stdin**. `ai-memory write-page --body -` silently stored an empty body while still reporting success. | Always pass `-i`; add `-t` only when stdin and stdout are both terminals. `AI_MEMORY_NO_TTY=1` now only disables TTY allocation, no longer disconnects stdin. |

### Terse fixes (table)

| Commit(s) | PR | Defect → Fix |
|---|---|---|
| `60c9a88` | #196 | Premature public API surface (a table fn + 3 constants + 2 tests) built ahead of a not-yet-landed feature; walked back to private, while simultaneously *widening* `HookEnvelope`'s `Debug` redaction to also cover `title_hint`/`body_excerpt`, not just `raw`. |
| `b3c65b6` | — | Hook-spool tests assumed exactly one file per directory via `read_dir().collect()`; a `.drain.lock` file present alongside `.json` entries broke that. Fixed by filtering on the `.json` extension. |
| `e851837` | #249 | `best_body_excerpt` had **no size cap at all** for `UserPrompt`/`Notification`/`PostCompaction` bodies (only `PostToolUse` was capped). Fixed with a universal 16 KiB backstop moved into `Sanitized::new` itself (applies to every observation kind by construction) plus per-kind named caps. |
| `2a46387` | — | `insert_observation` accepted a raw `NewObservation`; sanitization was enforced only by caller convention. Fixed: the signature now requires `Sanitized<NewObservation>`, whose only constructor scrubs — "parse, don't validate" applied to the privacy boundary. |
| `0736660` | — | Kimi's production install uses the script-stem `user-prompt-submit` as the `--event` value; the handoff-delivery branch only matched the legacy `user-prompt` spelling, so on real installs it never fired and a literal `"{}"` was injected into the turn. Fixed by gating on `HookEvent::parse(...)==UserPrompt` (canonicalizes both spellings). |
| `526f4bd`, `9e48d0d` | — | Kimi Code fires `SessionStart` but discards its stdout/result, so handoff delivery there was silently lost. Moved to `UserPromptSubmit`, whose stdout Kimi does inject as a `hook_result` user message. |
| `d4585a5` | #237-adjacent | Grok stores harness scaffolding (env block + Claude-style `<system-reminder>` blocks: project instructions, skills catalogue, connected MCP servers) inside `user` transcript records; the adapter only skipped the environment block. Measured leak: 5 events/42,984 bytes → 2 events/327 bytes on one captured session; 43,430 → 1,017 bytes live. Also this crowded out real conversation against `render_managed_context`'s 30,000-char packet cap / 6,000-char per-event cap. |
| `c181749`, `96087c8` | #224 | Windows PowerShell fallback hooks emitted serialized `CLIXML` progress noise on every hook when run under a nested PowerShell host (e.g. Antigravity CLI), polluting the JSON stdout contract. Fixed: force text output, silence non-interactive progress records; also protect `$env:` setup via `-EncodedCommand` instead of a nested quoted command, since outer Windows hook runners were expanding the inline `$env:` before the inner PowerShell process received it. |
| `b8f8316`, `41928d8` | #250 | `install-mcp --client claude-desktop` wrote to the plain `%APPDATA%\Claude\` path even when Claude Desktop is MSIX-packaged, silently producing a config the running app never reads. Fixed: detects the MSIX `LocalCache` path, prefers an existing config when multiple package dirs exist, and fails with an explicit `--config-file` recovery instruction on ambiguity. |
| `46b42e6` | #239 | `memory_query` fired a writer-actor `bump_access` command for **every** page in **every** search result, on all 3 search paths — a burst of overlapping queries flooded the single writer actor with redundant reinforcement writes. Fixed: a shared cooldown clock (`access_bump_seen`) bumps a page at most once per `ACCESS_BUMP_COOLDOWN` (60s), self-pruning aged-out entries; selection logic factored into a pure, unit-testable `select_bumpable` helper. |
| `f55e32c` | #277 | Hybrid search gave FTS, vector, and graph candidate streams *different* bounded candidate windows — a small result limit could exclude a canonical page before post-fusion authority ranking got a chance to promote it. Fixed: all three streams share the same bounded window used by authority-aware FTS search; candidate-limit arithmetic made saturating throughout. |
| `21246cb` | #273 | `move-project` "true move" left managed workstreams pointing at the **source** `workspace_id` after the project itself moved, hiding portable history from destination-scope lookup and violating the project/workspace pairing invariant. Fixed: workstreams re-stamp in the same transaction; response reports `workstreams_moved`. |
| `cce4961` | #275 | Forced workspace deletion removed DB rows via cascade but left the immutable managed-workstream segment directories orphaned on disk. Fixed: segment directories removed server-side in the same filesystem success/failure report. |
| `2fbcbeb` | #279 | Scheduled hollow-project cleanup cascade-deleted older projects whose *only* history was a managed workstream (including one with a live run), stranding the workstream heartbeat and orphaning transcript segments. Fixed: cleanup now treats managed workstreams as project data. |
| `2fe9626` | #265 | Capture-exclusion path matching didn't canonicalize the hook's working directory, so filesystem aliases (macOS `/var` vs `/private/var`) could turn an excluded file event into a spooled one. |
| `a67d5f4` | #241 | ai-memory's own injected SessionStart context packet, once persisted by Claude Code and later re-read via a `tool_result`, re-entered the portable ledger — a feedback loop recursively consuming future packet budgets. Fixed: every rendered packet is prefixed with a versioned origin marker (`<!-- ai-memory:managed-workstream-packet:v1 -->`); the Claude transcript importer excludes any `tool_result` whose body starts with that marker (or the legacy pre-marker header), anchored at start-of-body so a result that merely *mentions* the marker mid-text is still ingested. |
| `75ff81f` | #292 | OpenAI-compatible provider's structured-output mode defaulted to a lenient prose-parse (`strict=false`), letting local models replace consolidation JSON with prose or omit required fields. Fixed: default flips to `strict=true` (`response_format=json_schema`); paired with a new narrow classifier (`is_response_format_rejection`, matches only 400/422 bodies naming `response_format`/`json_schema`/"structured output") so genuinely incompatible endpoints still fall back, while unrelated 4xx errors (auth/quota/bad-model) still hard-fail loudly. |

---

## Performance & efficiency changes

| Change | Commit | Measured/stated numbers |
|---|---|---|
| M8 access-counter reinforcement throttled | `46b42e6` | At most once per page per `ACCESS_BUMP_COOLDOWN` = 60s; cooldown map self-prunes to the recently-searched working set. |
| FTS authority metadata reuse | `f5ef752` | Avoids a second per-candidate authority lookup by reading it off data the FTS query already returns. |
| Hybrid candidate-window alignment | `f55e32c` | Removes an asymmetry where FTS/vector/graph streams used different bounded windows before authority-based fusion. |
| Embedding-backfill deduplication | `cb37a7f` (`embed.rs`) | Scheduler tick and `/admin/embed` now share one implementation; the scheduler now **skips empty pages** instead of embedding empty strings (previously wasted embedder calls). |
| `write_atomic` delegation | `cb37a7f` (`apply_shared.rs`) | CLI's hand-rolled tempfile+rename replaced by `ai_memory_wiki::write_atomic`, gaining parent-dir fsync durability the CLI's own copy lacked. |
| SessionEnd consolidation decoupled from hook latency | `6b3aedb` | Hook response no longer blocks on LLM provider latency at all; work happens in a background worker polling every 15s. |

No headline throughput/latency benchmarks were found in the range (no `bench:` gate touched); the measured numbers above are correctness/volume figures (byte counts, cooldown windows), not latency/throughput deltas.

---

## Testing, CI, and gates

- **New CI job**: `.github/workflows/ci.yml` gains `source-install` (`5405cc7`) — runs `cargo install --path crates/ai-memory-cli --debug --root target/source-install` **without** the lockfile (deliberately, the only such job in the repo) then smoke-tests `--version`. Exists specifically to catch the class of break where `cargo install --path`'s unlocked dependency resolution picks up a newer semver-compatible crate (here, `rmcp` 1.8 vs. the locked 1.7) that breaks compilation while every lock-aware CI/dev build stays green.
- **52 new tests** from the `cb37a7f` code-audit refactor, spanning: writer-actor unit tests (FIFO order, error isolation, batch rollback, clean shutdown, post-shutdown `WriterClosed`); managed-workstream ledger lifecycle tests (heartbeat leases, idempotent finish, foreign-event batch rollback, `accept_context`, event ordering/limits, stale-lease expiry); a 13-row table-driven scope-resolution suite; a migration-recovery test that poisons a migration mid-run and asserts clean rollback + convergent re-run; curator classification/pinned-exclusion/age-math/read-only-guarantee tests (byte+mtime snapshot of every wiki file before/after, asserting zero mutation); LLM `auth_file`/`opencode` round-trip and permission tests.
- **Docs-as-test parity check** (`9abd51a`): new `architecture_lists_every_visible_cli_subcommand` (`crates/ai-memory-cli/src/cli.rs`) uses `include_str!("../../../docs/ARCHITECTURE.md")` to extract the "## CLI subcommand surface" fenced block at compile/test time and asserts it as a `BTreeSet` exactly matches `Cli::command()`'s actual visible (non-hidden) subcommands — a doc-mechanically-synchronized-with-code guard, analogous in spirit to this project's own generated-artifact parity tests.
- **Acceptance-methodology shift, four separate commits** (`960dbff`, `8b87908`, `3606faa`, `d3cfd36`): a recurring theme of replacing a nondeterministic proxy for "did the expected thing happen" with an assertion against durable system state:
  - `960dbff`: the real-harness acceptance script previously asked the model to echo back a sentinel it must have read from injected context — flaky, because large hook packets can be file-backed and whether the model chooses to `Read` the file isn't a protocol guarantee. Replaced with direct SQLite assertions (`managed_runs.sync_through` + `context_delivered`, a new `workstream_events` row past the pre-leg sequence).
  - `8b87908`: removed a redundant `tokio::time::timeout(1s, ...)` wall-clock proxy around a test that already asserts the provider was genuinely never called.
  - `3606faa`: three hand-rolled "loop N times, break if persisted" polling call sites in `serve.rs` tests consolidated into one `wait_for_maintenance_success` helper using a real 5-second deadline instead of a magic iteration count.
  - `d3cfd36`: a concurrency-fairness test asserted an aggregate `total_ops >= SESSIONS * 50`, which could mask one fully-starved session behind others' throughput. Rewritten to assert a per-session floor (`MIN_OPS_PER_SESSION = 5`) for **every** session individually.
- **New test files**: `crates/ai-memory-cli/tests/{marker_scope,completions}.rs`, `crates/ai-memory-consolidate/tests/embed_backfill.rs`.
- **`cargo-deny` cleanup** (`64ee534`): removed the unused `syntect` dependency and its transitive `plist`/`quick-xml`/`bincode`/`yaml-rust` chain, eliminating 2 high-severity `quick-xml` DoS advisories and clearing 4 previously-necessary `deny.toml` advisory-ignore entries (`ignore = [...]` → `ignore = []`) — the syntax-highlighting crate was confirmed unused, so ai-memory's rendered Markdown behavior is unchanged.

---

## Dependencies, runtime, schema, and config changes

- **Version**: `Cargo.toml` workspace version `1.17.1` → `1.19.2` (6 releases in range: v1.17.2, v1.17.3, v1.18.0, v1.19.0, v1.19.1, v1.19.2).
- **New dependency**: `clap_complete = "4"` (shell completions).
- **Removed dependencies**: `syntect` and its transitive `plist`, `quick-xml`, `bincode`, `yaml-rust` (unused; closed 2 high-severity `quick-xml` DoS advisories, cleared 4 `deny.toml` ignore entries).
- **Crate dependency moves** (from the `cb37a7f` refactor): `ai-memory-cli` drops `subtle`, `getrandom`; `ai-memory-mcp` gains `subtle`, `base64`, `getrandom`; `ai-memory-web` gains `tower`, `tower-http`.
- **New migrations**:
  - `V33__ingest_keys.sql` — project-scoped idempotency-key table (rewritten once in-arc before any release saw the intermediate shape).
  - `V34__session_consolidation_jobs.sql` — durable consolidation job queue, `BEFORE INSERT` scope-integrity trigger.
  - `V35__session_end_observation_watermark.sql` — adds `sessions.ended_observation_count` (backfilled at migration time).
- **New/changed config and env vars**:
  - `capture_assistant` / `AI_MEMORY_CAPTURE_ASSISTANT` (new, off by default).
  - `AI_MEMORY_LLM_COMPAT_STRICT` — default value flips `false` → `true` (env var semantics invert: now an explicit opt-**out**).
  - `AI_MEMORY_IGNORE_MARKER`, `AI_MEMORY_PROJECT_STRATEGY` — moved into a `RuntimeEnv` struct to preserve the "one config-read path" invariant (`Config::load()` is the only allowed `std::env::var` call site).
  - `CLAUDE_CONFIG_DIR` — now honored by `install-mcp`, `install-hooks`, `install-skills`, `uninstall`, and the Docker wrapper (forwarded into the helper container).
  - `CLAUDE_CODE_SESSION_ID` — new, forwarded by both Docker wrapper scripts for the session-aware MCP bridge.
  - `AI_MEMORY_NO_TTY=1` — semantics narrowed: now disables only TTY allocation, no longer also disconnects stdin.
  - New `--fresh` CLI flag on `ai-memory run`.
  - New `--session-aware` flag on `install-mcp --client claude-code`.
  - `--project-strategy` on `install-hooks` becomes `Option<...>`; unset now means "preserve prior baked value" instead of defaulting to `basename`.
- **Runtime/toolchain**: `rust-toolchain.toml` pins Rust 1.95 (referenced throughout the AGENTS.md rewrite; not independently diffed in this range but stated as current).
- **AGENTS.md**: wholesale regenerated (`5ee5f1e`, via `/init`) from a ~50-line summary into a ~300-line contributor guide enumerating 15 numbered "cross-cutting invariants" (single config-read path, single-writer SQLite actor, transactional index commits, typed 3-tuple identity, bounded fire-and-forget hooks, typed sanitization boundary, JSON-schema-only LLM structured output, denormalized embedding provider/model/dim, live-process check before destructive ops, atomic file writes, no global singletons, zero-LLM default path, provider-auth-before-construction, self-filtering tracing subscribers) plus additional scope/auth/wiki-mutation boundary rules.

---

## Deletions and reversals

| What | Commit | Reason stated / found |
|---|---|---|
| Premature public API surface (`assistant_message_field()` table fn, `ASSISTANT_PROTOCOL_VERSION`/`ASSISTANT_PROTOCOL_MAX_INPUT_BYTES`/`ASSISTANT_EXCERPT_MAX_BYTES` as pub constants, 2 tests) | `60c9a88` | Walked back speculative API surface built ahead of a not-yet-landed later PR; `mod assistant_capture` reverted `pub` → private. |
| `AuthLevel::is_root`, `ScopeResolver::create_explicit`, `ChatRequest::with_system`, `MemoryServer::with_consolidator` | `cb37a7f` | Dead code, zero callers workspace-wide — confirmed by diff (each fully removed). |
| Unused `regex`, `thiserror` deps from `ai-memory-hooks/Cargo.toml` | `cb37a7f` | Confirmed removed from the manifest. |
| **`ManagedHarness::from_name` — claimed removed, verified NOT removed** | `cb37a7f` (self-described) | The commit's own description lists this as a 5th dead-code removal. Verified false: it still exists at HEAD (`crates/ai-memory-workstream/src/harness.rs:34`), still called by tests added in *later* in-range commits (`9c6a2ab`, `504a895`). `git show cb37a7f --stat -- crates/ai-memory-workstream/` is empty — this commit never touched that crate. Either the claim was wrong when written or referred to a state superseded before HEAD; either way it is a live method today. |
| `deny.toml`'s 4-entry advisory ignore-list | `64ee534` | Cleared after removing the `syntect` dependency chain that made those advisories theoretically reachable but practically unused. |
| Antigravity `direct_paths()` guesses: `SearchPath`, `DirectoryPath`; tool-family guesses: `read_url_content`/`read_resource`/`call_mcp_tool` → `Unknown` | `6451beb` (reverting part of `94e0f5c`) | Unverified against live payloads; reverted to fail-closed rather than risk a capture-exclusion silently failing to match on an unrecognized path key. |
| `finalize-session`'s local-SQLite-direct-read capability | `cb37a7f` | **Genuine capability regression, not a pure refactor.** Before: opened the local data directory directly and printed an empty report gracefully if the DB file was absent — fully offline for the discovery phase. After: unconditionally calls `GET /admin/open-sessions` over HTTP; an unreachable server now fails the whole command (only an explicit 404 maps to "nothing to finalize"). Documented as intentional in CHANGELOG/README ("every CLI command is a thin HTTP client of the running server"), but any port wanting offline `finalize-session`-equivalent tooling needs to consciously accept or work around this constraint. |
| CHANGELOG entry misplacement | `60004b4` | `fe404c0`'s changelog entry had landed under the already-released `[1.17.1]` heading instead of `[Unreleased]`; moved, no code change. |
| Inaccurate keyed-ingest changelog entry | `fd2881c` | `fc8846d`'s entry still described "skip the whole replay," which `2a771a3` had already changed to resume-vs-skip; deleted/corrected to keep exactly one accurate entry. |

---

## Known bugs, TODOs, gaps, and self-reported debt

Found via a targeted `TODO|FIXME|HACK|XXX|todo!|unimplemented!|#\[ignore|known issue|not implemented|not supported in v1|limitation` sweep of every file changed in the range, plus direct reads of `docs/managed-workstreams.md`, `docs/marker-file.md`, `SECURITY.md`, and `docs/llm-provider-comparison.md` at HEAD:

- **Kimi Code, self-reported, v1**: "Re-briefing after `/clear` is not supported in v1" — identical wording appears in `CHANGELOG.md`, `docs/marker-file.md`, `hooks/kimi-code/user-prompt-submit.sh`, and a code comment in `crates/ai-memory-cli/src/commands/hook.rs:630`.
- **Kimi Code, self-reported, v1** (`docs/managed-workstreams.md:207-222`): subagent transcripts (`agents/<id>/wire.jsonl` other than `main`) are not imported and are recorded as an extraction-loss annotation; legacy sessions keeping `wire.jsonl` directly in the session directory (pre-`agents/` layout) are neither discovered nor imported.
- **LLM compat, self-reported gap** (`docs/llm-provider-comparison.md`, added by `75ff81f`): an endpoint that silently mishandles `response_format` *without* a recognizable rejection response is not auto-detected by the new classifier and still needs a manual `AI_MEMORY_LLM_COMPAT_STRICT=false`.
- **Assistant capture, self-reported** (`SECURITY.md`, added by `f28029c`): the opt-in is global to the install — there is no per-project marker to exclude a sensitive repository once `capture_assistant` is on (assistant text is not path-attributable); operator `extra_patterns` run only server-side, so a secret matched *only* by such a rule can still sit briefly in the client spool/wire before reaching the server.
- **`ManagedHarness::from_name` discrepancy** (see Deletions above): a commit's own description claims a removal that verifiably did not happen; the method is live at HEAD.
- **Doc drift**: `docs/ARCHITECTURE.md`'s crate-layout table still omits `ai-memory-web` entirely, even after `cb37a7f` created a new file inside it (`mount.rs`) — found via direct diff inspection, not self-reported.
- **Two pre-existing `#[ignore]`-marked tests at HEAD** (present before this range, untouched by any commit in it — confirmed via `git log -p <range> -- <file> | grep -c <test name>` returning 0 for both):
  - `crates/ai-memory-cli/src/commands/render_shared.rs:1400` — `generated_capture_policy_v1_node_runtime_evidence`, requires a local Node with `--experimental-strip-types` to execute a generated TypeScript capture-policy module as literal runtime evidence (an interesting cross-language codegen artifact: this Rust project emits a canonical TypeScript capture-policy module, `ts_capture_policy_v1()`, consumed by the OpenClaw/OpenCode plugin integrations — pre-dates this range, first introduced in `45c4dd4`).
  - `crates/ai-memory-cli/tests/removal.rs:858` — `purge_data_refuses_when_sibling_alive`, a best-effort test requiring a real sibling process and `sysinfo` process-table access; explicitly documented as "not in the default run."
- **No portable cross-harness rename support** (`docs/managed-workstreams.md:297-314`): renaming a checkout directory can leave Claude Code/Codex/OpenCode/Pi/Kimi/OMP session locators stale; "there is no portable, supported API that rewrites every harness's private project locator," and ai-memory explicitly does not attempt to mutate those private stores.

---

## Portable ideas

Ranked by direct applicability to a TypeScript-based memory/code-intelligence project; "generic" = the pattern, not the code, transfers.

1. **Type-enforced sanitization boundary** (`Sanitized<T>` with a single scrubbing constructor) — **highly portable**: a branded/opaque type or a class with a private constructor and one static factory makes "cannot construct this type without passing through the sanitizer" a compile-time guarantee. The single most directly transferable idea in the range.
2. **Universal body-size backstop at the persistence-type boundary, layered under per-event-kind caps** — **portable**: per-event caps are necessary but not sufficient; one ceiling enforced at the type-safe write boundary catches any future event kind that forgets its own cap.
3. **Double opt-in for new sensitive-data collection** (server config flag AND client install flag, both required) — **portable**: neither side alone can silently enable new capture.
4. **Sanitize-before-truncate ordering; server never trusts client-declared length/content, independently re-validates and re-caps** — **portable**, applies to any client/server ingestion boundary.
5. **Centralize scope/config resolution behind one resolver function, with per-field independent fallback chains, so no caller can bypass it and silently diverge** — **portable**: the `.ai-memory.toml` unification is exactly this pattern; the underlying lesson (one resolver, not N ad hoc call sites) is stack-agnostic.
6. **Guard destructive operations against a *live lease*, not a status enum** (check expiry, not just `state='active'`) — **portable** to any "is this thing still running" guard.
7. **`Option<T>` to distinguish "explicit default" from "unset," required to support "preserve prior value on an idempotent re-apply"** — **portable**, a common gap in CLI flag design generally.
8. **Atomic multi-resource claim**: wrap two single-use claims in one transaction, executed only after every fallible step already succeeded, so a response failure can never leave one resource claimed and the other orphaned — **portable** to any hook/webhook ack path consuming more than one single-use resource per response.
9. **Generation/watermark idempotency for retried lifecycle events** (compare a monotonic count, not a wall clock) — **portable**, immune to clock skew, applies to any "has new work arrived since I last processed this" check.
10. **Convergent recovery via idempotent repair replay**: on a duplicate/retried terminal-lifecycle event, re-run every downstream tail-effect as a no-op-safe operation rather than branching on "have I seen this before" — **portable** to any at-least-once-delivered webhook/lifecycle system.
11. **Origin-marker exclusion of injected/synthetic content from re-capture**, anchored at start-of-body with a legacy-format fallback — **portable** to any agent-hook system that injects rendered context back into a transcript it later re-ingests.
12. **Durable queue + bounded background worker decoupled from the request/response path**, with lease+claim-id fencing, exponential backoff, and "release without spending an attempt" on graceful shutdown — **portable**, standard reliable-queue design, SQL-generic beyond literal syntax.
13. **Per-agent-kind capability predicates instead of a single boolean** (`session_start_injects_handoff()`, `user_prompt_injects_handoff()`) — **portable** to any multi-integration system where different third-party agents have different lifecycle-hook quirks.
14. **Brief-once-per-session via a filesystem/DB marker written only after success, fail-open on error** — **portable**, general pattern for "expensive one-time-per-session enrichment" when the delivery channel recomposes on every call.
15. **Content-hash/line-hash event IDs to survive journal rewrites** (fork/compaction/resume) — **portable** to any read-only transcript-import adapter over a third-party append-and-sometimes-rewrite log.
16. **Docs-as-test parity check**: `include_str!` a markdown reference doc at test time and assert it matches the actual generated command surface — **portable**, directly analogous to this project's own generated-artifact parity-test culture (`scripts/__tests__/subagent-parity.test.ts`).
17. **Assert against durable system state/cursors, never against downstream consumer behavior or an aggregate sum, when a test needs determinism** — **portable**, a recurring theme across four separate test-hardening commits in this range.
18. **Generic `Envelope<Extras>`-style unification of near-identical token/credential shapes** (`StoredOAuthToken<E>` unifying `OidcToken`/`OpenAiOAuthToken`) — **portable**, a textbook generic-over-payload pattern.
19. **When broadening a shared/generic helper to fix one integration's problem, scope the fix narrowly (agent + tool + field) instead** — **portable process lesson**, directly evidenced by the Antigravity regression-then-fix pair.
20. Less portable / stack-specific: the `rmcp`-dual-role bridge plumbing, `cargo install --path`-vs-lockfile CI gap, SQLite `WITHOUT ROWID` + trigger-based scope-integrity checks (the *pattern* — a DB-level integrity constraint — is generic; the literal syntax is not), and the Docker-wrapper TTY/stdin flag logic (Docker-specific, though the underlying "attach stdin whenever it isn't a terminal, `-t` only when it is" rule generalizes to any process-wrapping shim).

---

## Commit index

| sha | date | subject | area | PR | one-line effect |
|---|---|---|---|---|---|
| `fe404c0` | 2026-07-20 | feat(hooks): strip raw assistant-message before spool and wire (#196) | privacy/capture | #196 | Unconditionally strips raw `last_assistant_message` at 4 choke points; no behavior change. |
| `aab94b5` | 2026-07-21 | install-mcp: honour CLAUDE_CONFIG_DIR for claude-code | install/config | #196-adjacent | MCP registration path resolves through `CLAUDE_CONFIG_DIR`. |
| `4760311` | 2026-07-21 | install-hooks: honour CLAUDE_CONFIG_DIR for claude-code settings | install/config | — | Hooks settings path resolves through `CLAUDE_CONFIG_DIR`. |
| `4efe608` | 2026-07-21 | install-skills: honour CLAUDE_CONFIG_DIR for the global claude root | install/config | — | Global skills root resolves through `CLAUDE_CONFIG_DIR`; uninstall sweeps both paths. |
| `21b70d8` | 2026-07-21 | feat: add `ai-memory completions <shell>` for shell tab completion | install/config | — | New completions subcommand, generated from the clap command tree. |
| `60c9a88` | 2026-07-21 | fix: narrow assistant payload hardening | privacy/capture | #196 | Walks back premature API surface; widens Debug redaction. |
| `b3c65b6` | 2026-07-21 | test: ignore hook drain lock in payload checks | privacy/capture | — | Filters `.drain.lock` out of spool-directory test assumptions. |
| `60004b4` | 2026-07-21 | docs: place assistant hardening in unreleased notes | privacy/capture | #196 | CHANGELOG section fix, no code change. |
| `371cfe9` | 2026-07-21 | docs: add Atlas Cloud compatibility recipe | install/config | — | Documents Atlas Cloud via the existing `openai-compat` provider. |
| `2d699f7` | 2026-07-21 | fix(cli): complete Claude config relocation support | install/config | #196-adjacent | Rounds out CLAUDE_CONFIG_DIR support (uninstall, path_util). |
| `f4218a3` | 2026-07-21 | test(cli): harden shell completion output | install/config | — | Additional completions-output tests. |
| `31ce545` | 2026-07-21 | fix(cli): protect Windows hook commands from expansion | install/config | #214 | `-EncodedCommand` instead of inline `$env:` to prevent outer-runner expansion. |
| `bc26d9c` | 2026-07-21 | fix(wrapper): support SELinux host writes | install/config | #212 | Adds `--security-opt label=disable` only to short-lived helper commands. |
| `a2ee96b` | 2026-07-21 | fix(wrapper): handle completion pipe closure | install/config | — | Buffers completions before streaming to avoid Docker pipe-close errors. |
| `022638d` | 2026-07-21 | fix(wrapper): support empty args on macOS bash | install/config | — | Fixes empty-args handling on macOS bash. |
| `d62b210` | 2026-07-21 | release: v1.17.2 | release | — | Version bump. |
| `64ee534` | 2026-07-21 | fix(deps): remove unused vulnerable syntax stack | install/config | — | Drops `syntect`+transitive deps; clears 4 RUSTSEC ignores. |
| `b479d31` | 2026-07-22 | fix(wrapper): clarify remote upgrade state | install/config | — | Corrects upgrade-guidance wording for remote/Docker deployments. |
| `e4767f4` | 2026-07-22 | release: v1.17.3 | release | — | Version bump. |
| `f28029c` | 2026-07-22 | feat(hooks): opt-in assistant/Stop capture for Claude Code (#196) | privacy/capture | #196 | Double opt-in sanitized+capped assistant excerpt capture. |
| `e2f5af9` | 2026-07-22 | hooks: deliver kimi-code handoff via UserPromptSubmit | kimi/grok-harness | — | Moves Kimi handoff delivery off SessionStart. |
| `9ddb322` | 2026-07-22 | test: add kimi fake-mode fixture to managed workstream acceptance | kimi/grok-harness | — | Fake-mode Kimi acceptance fixture. |
| `23e1f9b` | 2026-07-22 | docs: document managed kimi adapter and handoff delivery fix | kimi/grok-harness | — | README/docs updates for Kimi. |
| `526f4bd` | 2026-07-22 | fix(core): deliver kimi handoffs on user-prompt, not session-start | kimi/grok-harness | — | Core predicate: `session_start_injects_handoff()==false` for Kimi. |
| `33f9808` | 2026-07-22 | feat(workstream): plan Kimi Code managed launches | kimi/grok-harness | — | `ManagedHarness::Kimi`, launch/resume argv semantics. |
| `a4b02af` | 2026-07-22 | feat(workstream): import Kimi Code wire journals read-only | kimi/grok-harness | — | Read-only `wire.jsonl` transcript import. |
| `9e36197` | 2026-07-22 | feat(cli): expose `ai-memory run kimi` and join the auto pool | kimi/grok-harness | — | Kimi joins the automatic bare-run harness pool. |
| `6a03336` | 2026-07-22 | feat(hooks): accept kimi-code as a managed and automatic run agent | kimi/grok-harness | — | Hook-side `AgentKind::KimiCode` validation. |
| `9e48d0d` | 2026-07-22 | feat(cli): inject the kimi handoff on the user-prompt hook | kimi/grok-harness | — | UserPromptSubmit handoff injection for Kimi. |
| `96441fa` | 2026-07-22 | docs: clarify kimi handoff linking and record adapter limitations | kimi/grok-harness | — | Documents v1 Kimi limitations. |
| `0736660` | 2026-07-22 | fix(cli): match the installed user-prompt-submit event stem for kimi | kimi/grok-harness | — | Canonicalizes event-token matching via `HookEvent::parse`. |
| `673093d` | 2026-07-22 | hook(kimi): deliver the compiled project brief once per session | kimi/grok-harness | — | Brief gated to first user prompt via a filesystem marker. |
| `6f9c894` | 2026-07-22 | hooks(kimi): briefing once per session in the script path + docs | kimi/grok-harness | — | Mirrors the native gate in the script-fallback hooks. |
| `07c925f` | 2026-07-23 | test(hooks): close assistant capture privacy gaps | privacy/capture | — | End-to-end sentinel test through storage/FTS/page/handoff/LLM prompt. |
| `260af15` | 2026-07-23 | fix(workstream): harden Kimi managed continuity | kimi/grok-harness | — | Continuity hardening for Kimi managed runs. |
| `c181749` | 2026-07-23 | fix(hooks): keep Windows hook transport textual | install/config | #224 | Forces text output, silences PowerShell CLIXML progress noise. |
| `96087c8` | 2026-07-23 | fix(hooks): preserve raw PowerShell hook stdin | install/config | #224 | Preserves stdin fidelity for PowerShell fallback hooks. |
| `f06dda4` | 2026-07-20 | feat(consolidate): score non-empty Stop for the session reviewer (#196) | privacy/capture | #196 | Non-empty Stop scores 88 (vs. flat 55) in the reviewer's sampling. |
| `80adf26` | 2026-07-23 | test(consolidate): state Stop sampling contract precisely | privacy/capture | — | Narrows an overclaimed test assertion to what's actually proven. |
| `3606faa` | 2026-07-23 | test(cli): wait deterministically for maintenance writes | session-lifecycle/mcp-bridge | — | Replaces magic-iteration polling with a real deadline helper. |
| `d72f31b` | 2026-07-23 | docs: complete managed Kimi support lists | kimi/grok-harness | — | README/docs completeness for Kimi. |
| `2a46387` | 2026-07-23 | feat(store): take Sanitized<NewObservation> at the writer boundary | privacy/capture | — | Type-enforces the sanitization boundary at the writer API. |
| `98ad37f` | 2026-07-23 | test(store): serialize warning capture | ingest/refactor | — | Mutex-serializes a shared log-capture test helper. |
| `fc8846d` | 2026-07-23 | feat(hooks): idempotent ingest — a retried spool entry no longer duplicates | ingest/refactor | — | UUID `ingest_key` claimed atomically with the observation insert (V33). |
| `2a771a3` | 2026-07-23 | fix(hooks): complete keyed ingest after side effects | ingest/refactor | — | Revises the claim to resume, not just skip, interrupted downstream effects. |
| `fd2881c` | 2026-07-23 | docs: keep one accurate keyed-ingest entry | ingest/refactor | — | Corrects a now-inaccurate CHANGELOG entry. |
| `af29f57` | 2026-07-23 | feat(workstream): support kimi-cli alias | kimi/grok-harness | — | Accepts `kimi-cli` as an alias for `kimi`. |
| `504f5c9` | 2026-07-23 | release: v1.18.0 | release | — | Version bump. |
| `06b2099` | 2026-07-23 | fix(hooks): deliver the pending handoff on a managed SessionStart | session-lifecycle/mcp-bridge | #235 | Managed-run branch now always falls through to handoff resolution. |
| `ed65e70` | 2026-07-23 | prompts: instruct consolidator to emit wikilinks and mirror input language | prompts/retrieval | #238 | Adds wikilink and language-mirroring instructions to consolidation prompts. |
| `984fdc5` | 2026-07-23 | prompts: concrete cross-project link example + ALL page titles in input language | prompts/retrieval | #238 | Follow-up after glm-5 validation found 0 cross-project links, 1 English title leak. |
| `5ee5f1e` | 2026-07-23 | docs: regenerate AGENTS.md contributor guide via /init | release/docs | — | Wholesale AGENTS.md rewrite (50→~300 lines, 15 numbered invariants). |
| `cb37a7f` | 2026-07-23 | refactor: code-audit remediation across the workspace | ingest/refactor | #236 | 44-file refactor: 52 new tests, crate relocation, dead-code removal, new `/admin/open-sessions`. |
| `9c6a2ab` | 2026-07-24 | feat(workstream): add Grok Build CLI managed harness | kimi/grok-harness | #237 | New Grok managed-harness adapter (`--rules` context delivery). |
| `d4585a5` | 2026-07-24 | fix(workstream): exclude Grok's injected system reminders from the ledger | kimi/grok-harness | — | Filters harness-scaffolding leak from Grok's transcript import. |
| `4032802` | 2026-07-24 | docs: list Grok Build CLI as managed in the contribution protocol | kimi/grok-harness | — | Corrects a stale protocol-doc statement. |
| `39531f9` | 2026-07-24 | fix(wrapper): keep stdin attached when it is a pipe | install/config | #243 | `-i` always attached; `-t` only on a real terminal. |
| `8753d94` | 2026-07-24 | docs(changelog): reference the wrapper stdin fix PR | install/config | #243 | Attribution-only. |
| `5bae43f` | 2026-07-25 | fix: simplify normalize_segments | privacy/capture | — | Cosmetic Rust idiom refactor, no behavior change. |
| `012a729` | 2026-07-25 | fix: inject install-hooks staging dir | scope/purge | — | Fixes staged-hooks-directory injection for install-hooks. |
| `b8f8316` | 2026-07-25 | fix(mcp): detect MSIX-packaged Claude Desktop config path on Windows | install/config | #250 | Detects MSIX `LocalCache` config path. |
| `46b42e6` | 2026-07-24 | perf(mcp): throttle M8 access-counter bumps to once per page per minute | prompts/retrieval | #239 | 60s cooldown on `access_count`/`last_accessed_at` bumps. |
| `41928d8` | 2026-07-25 | fix(mcp): harden packaged Claude path detection | install/config | #250 | Hardens MSIX package-directory disambiguation. |
| `0055407` | 2026-07-25 | fix(wrapper): preserve stdin across every output mode | install/config | #243 | Extends the stdin-attachment fix to every wrapper output mode. |
| `ea354e6` | 2026-07-25 | fix(hooks): claim complete startup context atomically | session-lifecycle/mcp-bridge | — | Wraps managed-context + handoff claims in one transaction. |
| `1aae06b` | 2026-07-25 | test(prompts): pin graph and language guidance | prompts/retrieval | — | Locks the wikilink/language prompt wording with tests. |
| `33b93d1` | 2026-07-25 | docs(changelog): clarify access bump throttling | prompts/retrieval | #239 | Wording clarification, no behavior change. |
| `c63d1d5` | 2026-07-25 | test(hooks): isolate staged install coverage | scope/purge | — | Isolates staged-install test coverage. |
| `504a895` | 2026-07-25 | fix(run): recover orphaned native sessions | session-lifecycle/mcp-bridge | #240 | 3-way exists-check before resume; new `--fresh` flag. |
| `e851837` | 2026-07-25 | fix(hooks): bound lifecycle observation bodies | privacy/capture | #249 | Universal 16 KiB/2 KB body caps for every event kind. |
| `a67d5f4` | 2026-07-25 | fix(workstream): prevent Claude packet feedback | session-lifecycle/mcp-bridge | #241 | Origin-marker exclusion of self-injected packets from re-ingestion. |
| `e3c3314` | 2026-07-25 | feat(mcp): add Claude session-aware bridge | session-lifecycle/mcp-bridge | #244 | New `ai-memory mcp-bridge` stdio↔HTTP proxy, opt-in. |
| `960dbff` | 2026-07-25 | fix(test): make workstream acceptance deterministic | session-lifecycle/mcp-bridge | #242 | Replaces model-echo assertions with direct SQLite state checks. |
| `9abd51a` | 2026-07-25 | fix(docs): keep generated and reference surfaces current | release/docs | #256 | Adds docs-as-test CLI/ARCHITECTURE.md parity check + MSIX doc test. |
| `9f09ab8` | 2026-07-25 | release: v1.19.0 | release | — | Version bump. |
| `9453864` | 2026-07-25 | docs: attribute open-sessions release note to PR #236 | release/docs | #236 | Attribution-only. |
| `3d8b9b4` | 2026-07-26 | fix(cli): honor .ai-memory.toml scope in every client command | scope/purge | #259 | Unifies marker-based scope resolution across all CLI commands. |
| `3fe60ec` | 2026-07-26 | fix(cli): correct scope-resolution and purge-guard review findings | scope/purge | #259 | Adversarial-review follow-up: lease-expiry check, 409-not-500, RuntimeEnv. |
| `851dff3` | 2026-07-26 | docs(changelog): reference PR #259 in both entries | release/docs | #259 | Attribution-only. |
| `f69e896` | 2026-07-27 | fix(cli): harden marker scope and project purge | scope/purge | #259 | Further hardening of the scope/purge-guard change. |
| `6b3aedb` | 2026-07-27 | fix(hooks): persist session-end consolidation | session-lifecycle/mcp-bridge | #265 | Durable, generation-keyed consolidation queue (V34) outside hook latency. |
| `13fa721` | 2026-07-27 | docs(changelog): reference PR #265 | release/docs | #265 | Attribution-only. |
| `2fe9626` | 2026-07-27 | fix(hooks): normalize capture working directories | scope/purge | #265 | Canonicalizes hook cwd before path-exclusion matching. |
| `7fa2f87` | 2026-07-27 | fix(install-hooks): preserve baked project-strategy on re-apply | scope/purge | #267 | `--project-strategy` becomes `Option`; unset preserves prior value. |
| `0aa3ad5` | 2026-07-27 | test(purge): compare cleanup paths portably | scope/purge | — | Portable path comparison in purge cleanup tests. |
| `866e535` | 2026-07-27 | fix(install): follow symlinks when writing agent config files | scope/purge | #264 | Writes through symlinked config files instead of replacing the link. |
| `5a124fe` | 2026-07-27 | fix(hooks): make session re-end generation-based | session-lifecycle/mcp-bridge | #268 | Watermark/count comparison replaces wall-clock re-end check (V35). |
| `6e2bd92` | 2026-07-27 | docs(changelog): reference PR #268 | release/docs | #268 | Attribution-only. |
| `2ffcf84` | 2026-07-27 | feat(retrieval): rank canonical sources by authority | prompts/retrieval | #269 | Bounded source-authority adjustment after candidate generation. |
| `8f07327` | 2026-07-27 | docs(changelog): reference PR #269 | release/docs | #269 | Attribution-only. |
| `c41c1b8` | 2026-07-27 | docs: describe authority-adjusted CLI search | prompts/retrieval | #269 | Documents authority-adjusted search behavior. |
| `f5ef752` | 2026-07-27 | perf(retrieval): reuse FTS authority metadata | prompts/retrieval | #269 | Avoids a second per-candidate authority lookup. |
| `5a6886c` | 2026-07-27 | test(retrieval): cover noisy session candidate windows | prompts/retrieval | #269 | Tests session-candidate-window behavior under noisy input. |
| `2e82264` | 2026-07-27 | fix(install): harden symlink-preserving apply | scope/purge | #264 | Hardens the symlink-preserving write path. |
| `6d2c229` | 2026-07-27 | fix(install-hooks): preserve project strategy across agents | scope/purge | #267 | Extends project-strategy preservation to every agent renderer. |
| `8b87908` | 2026-07-27 | test(hooks): assert queued SessionEnd deterministically | session-lifecycle/mcp-bridge | — | Removes a redundant wall-clock proxy from a provider-not-called test. |
| `188b6ed` | 2026-07-27 | fix(hooks): make SessionEnd recovery convergent | session-lifecycle/mcp-bridge | #271 | Splits DropStale into DropInvalid/AlreadyEnded; convergent idempotent repair. |
| `e70304c` | 2026-07-27 | docs(changelog): reference PR #271 | release/docs | #271 | Attribution-only. |
| `21246cb` | 2026-07-27 | fix: preserve workstreams across true project moves | scope/purge | #273 | Re-stamps managed workstreams in the same transaction as a project move. |
| `0fd90cd` | 2026-07-27 | fix: move auto-improve rejection scope | scope/purge | — | Scope correction for auto-improve rejection bookkeeping. |
| `cce4961` | 2026-07-27 | fix: clean workstream segments on workspace deletion | scope/purge | #275 | Removes orphaned managed-workstream segment directories on workspace delete. |
| `f55e32c` | 2026-07-27 | fix: align hybrid authority candidate windows | prompts/retrieval | #277 | Unifies FTS/vector/graph candidate-window sizes before fusion. |
| `a161ba6` | 2026-07-27 | docs(changelog): attribute post-audit fixes to PRs | release/docs | — | Attribution-only, multiple PRs. |
| `2fbcbeb` | 2026-07-27 | fix: preserve workstream projects during maintenance | scope/purge | #279 | Hollow-project cleanup no longer cascade-deletes live-workstream-only projects. |
| `896229d` | 2026-07-27 | docs(changelog): attribute hollow sweep fix to PR | release/docs | #279 | Attribution-only. |
| `48ca40f` | 2026-07-27 | docs: refresh prior-art implementation status | release/docs | — | Updates the prior-art-vs-implemented status table. |
| `61eec2a` | 2026-07-27 | release: v1.19.1 | release | — | Version bump. |
| `d3cfd36` | 2026-07-27 | test(mcp): make sustained progress assertion portable (#283) | session-lifecycle/mcp-bridge | #283 | Per-session floor replaces an aggregate-sum fairness assertion. |
| `4e6462c` | 2026-07-28 | fix(cli): expose Antigravity session finalization (#284) | session-lifecycle/mcp-bridge | #284 | Generalizes finalize-session's default-agent framing and prints Antigravity guidance. |
| `0cbd94a` | 2026-07-28 | docs: clarify manual handoff attribution (#284) | session-lifecycle/mcp-bridge | #284 | Corrects a doc that mis-scoped a design decision as Antigravity-specific. |
| `5405cc7` | 2026-07-28 | fix(cli): support fresh rmcp source installs (#285) | session-lifecycle/mcp-bridge | #285 | Fixes `rmcp` 1.7→1.8 API drift on the unlocked source-install path; new CI job. |
| `f3e9c64` | 2026-07-28 | docs: sync frontend overview response shape | session-lifecycle/mcp-bridge | — | Corrects stale `/overview` response-shape documentation. |
| `830b937` | 2026-07-28 | release: v1.19.2 | release | — | Version bump. |
| `94e0f5c` | 2026-07-29 | fix(hooks): recognize antigravity-cli native tools and capture edit content | privacy/capture | #294 | Adds Antigravity tool recognition; introduces a scoping regression. |
| `0461bd2` | 2026-07-29 | docs(changelog): reference PR #294 for antigravity fix | privacy/capture | #294 | Attribution-only. |
| `6451beb` | 2026-07-29 | fix(hooks): narrow Antigravity capture fallback (#294) | privacy/capture | #294 | Fixes the regression; narrows the fallback to agent+tool-scoped, fail-closed elsewhere. |
| `75ff81f` | 2026-07-29 | fix(llm): constrain compat structured output by default (#292) | privacy/capture | #292 | Flips OpenAI-compat structured output to schema-constrained by default. |

---

## Ambiguities / open verification items

- Several PR-number attributions above (e.g. `6d2c229`→#267, `2fe9626`→#265, `0fd90cd`, `0aa3ad5`, `012a729`, `c63d1d5`) are inferred by matching a commit's touched files/behavior against the nearest dated CHANGELOG bullet carrying an explicit `(#NNN)` reference, since not every commit's subject line or body states its own PR number. Where no CHANGELOG bullet could be matched with confidence, the PR column is left as `—` rather than guessed. A GitHub API query against `akitaonrails/ai-memory` (not attempted here, to stay within the read-only local-git constraint) would give exact PR↔commit mapping if precision on any specific one matters.
- `ManagedHarness::from_name`'s claimed-vs-actual removal (see Deletions) could be settled definitively by checking whether a *later* commit re-added it after `cb37a7f`, versus the commit description simply being wrong when written; `git log -p --all -- crates/ai-memory-workstream/src/harness.rs` around the relevant lines would show which.
- The exact PR grouping behind `a161ba6` ("attribute post-audit fixes to PRs," plural) was not individually resolved per underlying commit (`0fd90cd`/`cce4961`/`f55e32c`/`2fbcbeb`/`21246cb`) beyond what each commit's own nearest CHANGELOG bullet already indicated.
