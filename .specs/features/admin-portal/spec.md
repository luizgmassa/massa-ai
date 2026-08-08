# Admin Portal — Full CRUD Web UI (spec)

Slug: `admin-portal`. Workflow: `to-prd` (synthesized from discovery session
`discovery-admin-portal`). Branch: `main`.

## Problem Statement

The massa-ai web UI at `/ui` is read-only — it can browse memories, projects,
handoffs, proposals, checkpoints, and dashboard metrics, but cannot create,
edit, or delete any of them. Every mutation today requires firing `curl`
commands or MCP tool calls against the Tools API. There is also no way to view
or edit `config.json` (`~/.config/massa-ai/config.json`) from the browser — the
config drives database connections, embedding models, LLM endpoints, API keys,
memory decay, hooks, Synapse, and every feature toggle, but it is invisible in
the UI. Finally, the agent harness model-profile registry
(`skills/model-profiles.json`) — which maps each `{profile, host, tier}` triple
to a `{model, effort}` pair for every agent across Claude, Codex, Cursor, and
OpenCode — is a build-time artifact with no runtime CRUD surface: editing it
means opening the file in an editor, regenerating host variants via a script,
then switching. A solo local operator who wants to manage the entire massa-ai
system from a single web surface has no such surface.

## Solution

Elevate the existing `apps/web-ui` static bundle (served at `/ui/*` by the
Tools API) from a read-only browser to a full admin portal. The portal provides
create, read, update, and delete operations for projects, memories, handoffs,
proposals, checkpoints, all massa-ai configuration sections, and the
model-profile registry. Write operations are enabled by default for trusted
local callers (the existing `isTrustedWebUiCaller` model already injects the
API key into the page for local requests). A sectioned form UI with typed
inputs and schema validation covers all 15 config sections. The model-profile
registry is managed through a user-level overlay
(`~/.config/massa-ai/model-profiles.json`) that merges over the built-in
`skills/model-profiles.json` — product source is never mutated at runtime.
Destructive operations use a confirm-and-go pattern (confirmation dialog, no
dry-run). A solo local operator can manage the entire massa-ai system without
leaving the browser.

## User Stories

### Memory Management

1. As a solo operator, I want to view all memories in a filterable, paginated
   table, so that I can browse what the system has stored.
2. As a solo operator, I want to create a new memory from a form (content,
   type, importance, tags, project scope), so that I can manually add a fact or
   decision without an MCP call.
3. As a solo operator, I want to edit a memory's content, importance, and tags
   inline, so that I can correct stale or inaccurate memories.
4. As a solo operator, I want to delete a memory with a confirmation dialog, so
   that I can remove obsolete or sensitive entries.
5. As a solo operator, I want the memory table to show type, level, importance,
   and truncated content, so that I can scan many memories quickly.
6. As a solo operator, I want to filter memories by type, level, and minimum
   importance, so that I can narrow to relevant subsets.
7. As a solo operator, I want to paginate through large memory sets, so that the
   page stays responsive even with hundreds of entries.

### Project Management

8. As a solo operator, I want to view all indexed projects with their document
   counts, so that I can see what is indexed.
9. As a solo operator, I want to index a new project by entering its absolute
   path and optional project ID, so that I can add a codebase to the search
   index from the browser.
10. As a solo operator, I want to trigger a force-reindex on an existing
    project, so that I can refresh a stale index after significant code changes.
11. As a solo operator, I want to reset (wipe) a project's vectors, symbols,
    and/or memories with a confirmation dialog, so that I can cleanly remove a
    project's data.
12. As a solo operator, I want to rename a project identity, so that I can fix a
    misnamed project ID without re-indexing from scratch.
13. As a solo operator, I want to merge one project identity into another, so
    that I can consolidate duplicate or split project entries.
14. As a solo operator, I want to see the indexing job status after triggering
    an index or reindex, so that I know when it completes.

### Handoff Management

15. As a solo operator, I want to view pending handoffs for a selected project,
    so that I can see cross-session handoffs waiting to be accepted.
16. As a solo operator, I want to create a new handoff (project ID, summary,
    target agent, open questions, next steps, files), so that I can leave a
    structured handoff for a future session.
17. As a solo operator, I want to accept an open handoff, so that I can mark it
    as picked up.
18. As a solo operator, I want to cancel (expire) an open handoff with a
    confirmation dialog, so that I can remove a stale handoff.

### Proposal Management

19. As a solo operator, I want to view pending auto-improvement proposals for a
    selected project, so that I can review what the auto-improve loop generated.
20. As a solo operator, I want to approve a proposal, so that its memory edit is
    applied and the proposal is flipped to approved.
21. As a solo operator, I want to reject a proposal, so that it is closed
    without applying.

### Checkpoint Management

22. As a solo operator, I want to view saved checkpoints in a table, so that I
    can see task progress snapshots.
23. As a solo operator, I want to create a new checkpoint (task ID, description,
    status, progress, current step, etc.), so that I can manually save task
    state.
24. As a solo operator, I want to restore a checkpoint, so that I can resume a
    task from a saved snapshot.
25. As a solo operator, I want to delete a checkpoint with a confirmation
    dialog, so that I can clean up obsolete checkpoints.

### Config Management

26. As a solo operator, I want to view the current config.json in a sectioned
    form UI, so that I can see every setting without reading a file.
27. As a solo operator, I want to edit the embedding configuration (provider,
    model, base URL, dimensions) in a form, so that I can switch embedding
    models.
28. As a solo operator, I want to edit the LLM configuration (enabled, base URL,
    API key, model, code model, temperature, max output tokens, timeout,
    disable-think) in a form, so that I can switch LLM backends.
29. As a solo operator, I want to edit the memory configuration (decay
    parameters, bootstrap settings, auto-improve settings, auto-importance) in a
    form, so that I can tune memory behavior.
30. As a solo operator, I want to edit the hooks configuration (enabled, max
    payload bytes, queue max pending, bridge settings) in a form, so that I can
    control lifecycle capture.
31. As a solo operator, I want to edit the search configuration (auto-reindex
    cap, query understanding, rerank) in a form, so that I can tune search
    quality.
32. As a solo operator, I want to edit the compression configuration (default
    strategy, min tokens, target ratio, prompt) in a form, so that I can control
    context compression behavior.
33. As a solo operator, I want to edit the cache configuration (enabled, L1/L2
    max sizes, default TTL) in a form, so that I can tune cache behavior.
34. As a solo operator, I want to edit the Synapse configuration (enabled,
    inhibition, scoring, metacognition, buffer) in a form, so that I can tune
    cognitive modulation.
35. As a solo operator, I want to edit the handoffs configuration (enabled) in a
    form, so that I can toggle cross-session handoffs.
36. As a solo operator, I want to edit the security configuration (API key, CORS
    origins, allowed extensions) in a form, so that I can manage access control.
37. As a solo operator, I want to edit the logging configuration (level, enable
    metrics, log file) in a form, so that I can control observability.
38. As a solo operator, I want to edit the data directory path in a form, so
    that I can relocate the massa-ai data store.
39. As a solo operator, I want to edit the impact analysis configuration
    (BFS-CTE enabled) in a form, so that I can toggle the CTE-backed impact
    query.
40. As a solo operator, I want to edit the capture policy (rules with pattern +
    disposition, max match work, max ignore patterns) in a form, so that I can
    control which files the indexer captures.
41. As a solo operator, I want to see a "restart required" badge on config
    sections whose changes cannot hot-reload, so that I know when a restart is
    needed.
42. As a solo operator, I want to save config changes with schema validation,
    so that a bad value is rejected before it can brick the server.
43. As a solo operator, I want a backup of the previous config.json to be
    created automatically before each save, so that I can recover from a bad
    edit.
44. As a solo operator, I want sensitive fields (API keys, database URL) to be
    masked in the form by default with a reveal toggle, so that shoulder-surfing
    risk is reduced.

### Profiles

45. As a solo operator, I want to view the available model profiles, so that I
    can see which profiles are shipped.
46. As a solo operator, I want to switch the installed agents to a different
    profile, so that I can change the model configuration across hosts.

### Model-Profile Registry

47. As a solo operator, I want to view the effective model-profile registry
    (all profiles, all hosts, all tiers, all `{model, effort}` pairs) in a grid,
    so that I can see what model and effort each agent tier resolves to per
    host per profile.
48. As a solo operator, I want to see which registry entries come from the
    built-in registry vs the user overlay, so that I can distinguish shipped
    defaults from my customizations.
49. As a solo operator, I want to add a new profile (name + description), so
    that I can define a custom model/effort spread without editing the built-in
    registry.
50. As a solo operator, I want to edit a profile's `{model, effort}` pairs
    per host per tier in a grid, so that I can fine-tune which model and effort
    each tier uses for each host.
51. As a solo operator, I want to edit a profile's description, so that I can
    document what the profile is for.
52. As a solo operator, I want to duplicate an existing profile as a starting
    point for a new one, so that I do not have to re-enter every cell from
    scratch.
53. As a solo operator, I want to delete a profile (with confirmation), so
    that I can remove a custom profile I no longer need.
54. As a solo operator, I want to restore a deleted profile (remove the
    tombstone from the overlay), so that I can undo a deletion while the
    overlay still exists.
55. As a solo operator, I want to edit `hostDefaults` (which profile each host
    defaults to), so that I can change the default profile per host.
56. As a solo operator, I want to edit `workflowTiers` (which tier each
    workflow uses), so that I can map workflows to tiers.
57. As a solo operator, I want to validate my edits against the registry
    schema before saving, so that a bad effort value or missing tier is caught
    before it can break the build.
58. As a solo operator, I want to regenerate the host variant artifacts after
    editing the registry, so that a new profile's on-disk variant directories
    exist before I switch to it.
59. As a solo operator, I want to clear the entire user overlay (reset to
    built-in only), so that I can start fresh from the shipped registry.
60. As a solo operator, I want the model and effort inputs to be validated
    against the host's effort enum (claude: low|medium|high|xhigh|max, codex:
    minimal|low|medium|high|xhigh, cursor: effort must be null when model is
    null, opencode: any non-empty string), so that I cannot enter an effort a
    host will reject.

### General UX

61. As a solo operator, I want write operations (create, edit, delete, approve,
    reject, reset, switch, regenerate) to be enabled by default when I access
    the portal from the local machine, so that I do not need to set an
    environment variable.
62. As a solo operator, I want destructive operations (delete memory, reset
    project, cancel handoff, delete checkpoint, delete profile, clear overlay)
    to show a confirmation dialog before executing, so that I do not
    accidentally destroy data.
63. As a solo operator, I want success and error feedback after every write
    operation, so that I know whether the action succeeded.
64. As a solo operator, I want the existing read-only views (Projects, Memory,
    Search, Handoffs, Proposals, Checkpoints, Dashboard) to continue working
    unchanged, so that the upgrade does not break existing browsing.
65. As a solo operator, I want the dark-mode toggle and markdown rendering to
    continue working, so that the existing UX is preserved.
66. As a solo operator, I want a "Config" navigation item, so that I can reach
    the config editor from the main nav.
67. As a solo operator, I want a "Profiles" navigation item, so that I can reach
    the profile switcher and model-profile registry editor from the main nav.
68. As a solo operator, I want the page to refresh its data after a write
    operation completes, so that I see the updated state immediately.
69. As a solo operator, I want the existing SSE real-time updates to continue
    working, so that data refreshes when indexing or observations occur.

## Implementation Decisions

### Architecture

- **Single web-ui bundle**: The admin portal is the existing `apps/web-ui`
  static bundle (`index.html`, `styles.css`, `app.js`, `dashboard.js`) served at
  `/ui/*`. No separate `/admin` app. The existing zero-build vanilla
  HTML/CSS/JS approach is preserved — no SPA framework, no build step.
- **Write-mode default ON for trusted local callers**: The existing
  `isTrustedWebUiCaller` check (local IP) determines trust. When trusted, the
  server injects the API key into the page's `<meta>` tag, and the client sends
  it as `x-api-key` on every request. Write operations are rendered
  unconditionally for trusted callers. The `MASSA_AI_WEB_WRITE_MODE` env flag
  and `localStorage` override remain as escape hatches but are no longer the
  default gate — trust is the gate.
- **Confirm-and-go pattern**: Destructive operations (delete memory, reset
  project, cancel handoff, delete checkpoint) use `confirm()` dialogs with a
  clear message naming the entity and action. No dry-run pattern for V1 —
  simpler UX, solo operator accepts the risk.
- **Sectioned config forms**: Each of the 15 config sections gets its own
  collapsible form card with typed inputs (text, number, boolean checkbox,
  enum select, string array list). A "Save" button per section sends a
  partial-update `PUT /api/v1/config` with only the changed section.

### Backend — New API Routes

1. **`GET /api/v1/config`** — Returns the current config.json as a JSON object,
   with sensitive fields (`security.apiKey`, `llm.apiKey`, `embedding.apiKey`,
   `database.url`) masked (e.g. `"***"`). Also returns a `restartNeededSections`
   array indicating which sections contain fields that cannot hot-reload.
   - Auth: standard `x-api-key` gate (not in `PUBLIC_PATHS`).
   - Response shape: `{ success: true, data: { config: MassaAiConfig, restartNeededSections: string[] } }`

2. **`PUT /api/v1/config`** — Accepts a partial config object (one or more
   top-level sections). Validates each provided section against the
   `MassaAiConfig` TypeScript interface at runtime (type-check + range-check).
   On validation failure, returns `{ success: false, error: "validation failed", details: [...] }`
   with 400 status. On success: backs up the current config.json to
   `config.json.bak.<timestamp>`, merges the partial update into the full
   config, writes atomically (temp file + rename), and returns the updated
   config with updated `restartNeededSections`.
   - Auth: standard `x-api-key` gate.
   - Atomic write: write to `config.json.tmp.<pid>`, then `fs.rename` to
     `config.json`.
   - Backup: copy current `config.json` to `config.json.bak.<ISO-timestamp>`
     before writing.
   - Restart-needed sections: `database`, `embedding`, `llm`, `security` (V1
     marks these as restart-required; all other sections are marked
     "applies on next request" but V1 does not implement hot-reload — the
     in-memory `config` object is not re-read after write).

3. **`POST /api/v1/checkpoints/delete`** — Deletes a checkpoint by ID. Thin
   wrapper over a new `DeleteCheckpointTool` (or direct repository call if the
   checkpoint repository exposes a delete method).
   - Auth: standard `x-api-key` gate.
   - Body: `{ id: string, projectId?: string }`.
   - Response: `{ success: true, data: { ok: true } }` or
     `{ success: false, error: "..." }`.

4. **`GET /api/v1/model-registry`** — Returns the effective model-profile
   registry: the built-in `skills/model-profiles.json` merged with the user
   overlay `~/.config/massa-ai/model-profiles.json` (when present). The
   response distinguishes which entries originate from the built-in registry
   vs the user overlay, so the UI can mark customizations. Tombstone-deleted
   profiles are absent from the effective registry but listed in a separate
   `overlay` section for restore.
   - Auth: standard `x-api-key` gate.
   - Response shape:
     `{ success: true, data: { registry: Registry, source: { builtin: Registry, overlay: OverlayData | null, tombstoned: string[] } } }`
     where `OverlayData` is the raw overlay file content (including
     tombstones), and `Registry` is the merged effective result.
   - On overlay parse failure: returns `registry = builtin`, `overlay = null`,
     `overlayError: "<message>"` (200 status — a bad overlay is a warning, not
     an error that blocks the view).

5. **`PUT /api/v1/model-registry`** — Accepts a full overlay object (the
   complete `~/.config/massa-ai/model-profiles.json` content to write).
   Validates the merged result (builtin + overlay) against `validateRegistry()`
   from `scripts/lib/model-profiles.ts`. On validation failure, returns
   `{ success: false, error: "validation failed", details: [...] }` with 400
   status. On success: writes the overlay atomically (temp + rename) to
   `~/.config/massa-ai/model-profiles.json` and returns the updated effective
   registry.
   - Auth: standard `x-api-key` gate.
   - Body: the full overlay object — `{ profiles?, hostDefaults?, workflowTiers?, tiers? }`
     with any tombstones (`{ "_delete": true }` on a profile key).
   - Validation: merge overlay over builtin, run `validateRegistry()` on the
     merged result. Violations are collected and returned together (same
     contract as the existing validator — all violations at once).
   - Atomic write: write to `model-profiles.json.tmp.<pid>`, then `fs.rename`.

6. **`POST /api/v1/model-registry/regenerate`** — Triggers
   `scripts/generate-subagent-artifacts.ts` to regenerate the host variant
   directories from the effective registry. Returns when the script completes
   (or a timeout, since generation may take a few seconds). The route runs the
   script as a child process with the same `MASSA_AI_MODEL_PROFILE` resolution
   the script uses internally.
   - Auth: standard `x-api-key` gate.
   - Response: `{ success: true, data: { regenerated: true } }` on success, or
     `{ success: false, error: "..." }` on script failure.
   - The route does NOT switch profiles automatically — regeneration creates
     the variant directories; switching is a separate explicit call to
     `POST /api/v1/profiles/switch`.

7. **`DELETE /api/v1/model-registry/overlay`** — Deletes the user overlay file
   entirely, resetting to built-in only. Does NOT require a body. Returns the
   updated effective registry (which is now the builtin alone).
   - Auth: standard `x-api-key` gate.
   - Response: `{ success: true, data: { registry: Registry } }`.

### Backend — Config Write-Through

The `@massa-ai/shared` config loader (`packages/shared/src/config/`) is
currently read-only — `config.get(key)` exists but `config.set()` does not. A
new `saveConfig(partial: Partial<MassaAiConfig>)` function will be added to
`packages/shared/src/config/config-loader.ts` (or a new
`config-writer.ts` module) that:

- Reads the current config.json from the XDG config path.
- Merges the partial update (shallow merge per top-level key — replacing a
  section replaces the whole section, not deep-merge).
- Validates the merged result against the `MassaAiConfig` shape (runtime
  type-check: required fields present, correct types, enum values valid,
  numeric ranges within bounds).
- Writes atomically (temp + rename).
- Returns the merged config.

The `config` singleton's in-memory state is NOT updated by `saveConfig` in V1 —
the running server keeps its load-time config. A restart picks up the new
config. This is documented in the restart-needed badges.

### Backend — Model-Profile Registry Overlay

The built-in registry (`skills/model-profiles.json`) is product source and is
never written by the API. A user-level overlay
(`~/.config/massa-ai/model-profiles.json`) merges over it at load time. The
overlay is the only file the API writes.

**Loader change** (`scripts/lib/model-profiles.ts` `loadRegistry()`):
The existing `loadRegistry()` reads only the built-in registry path. A new
`loadEffectiveRegistry()` function will:
1. Call the existing `loadRegistry(builtinPath)` to load and validate the
   built-in registry (fails as today if the built-in is missing or invalid —
   that is a product bug, not a user error).
2. Read `~/.config/massa-ai/model-profiles.json` if present (via the XDG config
   path, resolved the same way `config.json` is). On read/parse failure, log a
   warning and fall back to the built-in alone — a bad overlay never throws.
3. Merge the overlay over the built-in registry:
   - `profiles`: merge per-key. If the overlay profile has `_delete: true`,
     remove the built-in profile from the effective registry. Otherwise,
     replace the entire built-in profile with the overlay profile (shallow —
     the whole profile object, all hosts, all tiers).
   - `hostDefaults`: if present in the overlay, replace the entire
     `hostDefaults` object.
   - `workflowTiers`: if present in the overlay, replace the entire
     `workflowTiers` object.
   - `tiers`: if present in the overlay, replace the entire `tiers` array.
4. Run `validateRegistry()` on the merged result. If validation fails, log
   the violations and fall back to the built-in alone (the overlay is broken —
   do not serve an invalid effective registry).

**Tombstone semantics** — a profile with `{ "_delete": true }` in the overlay:
- Is removed from the effective registry during merge.
- Is listed in the `source.tombstoned` array of the `GET /model-registry`
  response so the UI can offer a "restore" action (which removes the tombstone
  from the overlay).
- Cannot be restored by simply re-adding the profile to the overlay — the
  tombstone must be explicitly removed first (or the profile re-defined in the
  override).

**Overlay write path** — the `PUT /api/v1/model-registry` route receives the
complete overlay object and writes it to
`~/.config/massa-ai/model-profiles.json` atomically. It does NOT deep-merge
the incoming overlay with the existing overlay — the request body IS the new
overlay. The UI is responsible for reading the current overlay, applying the
user's edit, and sending the full result. This matches the "shallow" merge
decision: simple, predictable, no server-side merge ambiguity.

### Frontend — New Views

4. **Config view** (`#/config`): Renders 15 collapsible section cards. Each
   card has a form generated from the config section's fields. Inputs are
   typed: `string` → text input, `number` → number input, `boolean` → checkbox,
   `enum` → select dropdown, `string[]` → comma-separated or tag-list input,
   nested objects → sub-groups. Sensitive fields are masked with a reveal
   toggle. Each card has a "Save" button that sends only that section to
   `PUT /api/v1/config`. Sections in `restartNeededSections` show a badge.

5. **Profiles view** (`#/profiles`): Two sub-views. The first sub-view calls
   `GET /api/v1/profiles` to list available profiles. Shows the current active
   profile (from the response). A "Switch" button per profile calls
   `POST /api/v1/profiles/switch`. Shows per-host switch results. The second
   sub-view is the model-profile registry editor (below).

6. **Model-profile registry editor** (sub-view within `#/profiles`): Calls
   `GET /api/v1/model-registry` to fetch the effective registry plus the
   overlay source. Renders a grid: rows = `{host, tier}` pairs, columns =
   profiles, cells = `{model, effort}`. Cells originating from the overlay are
   visually marked (e.g. a dot or highlight) so the user can see which entries
   are customizations. Tombstoned profiles show a "restore" button. The editor
   supports:
   - **Edit cell**: click a cell to edit `{model, effort}`. Effort input is a
     select constrained to the host's effort enum (`HOST_EFFORT_ENUM`). Model
     input is free text. Validation runs client-side on blur.
   - **Add profile**: a form with name + description. The new profile is
     initialized with `model: null, effort: null` for every `{host, tier}`
     (inherit) — the user then edits cells.
   - **Duplicate profile**: copies an existing profile's full grid into a new
     profile with a new name.
   - **Delete profile**: adds a tombstone `{ "_delete": true }` to the overlay.
     Confirm dialog. The profile disappears from the grid but appears in a
     "Deleted (restorable)" list until the overlay is saved.
   - **Restore profile**: removes the tombstone from the overlay. The built-in
     profile reappears in the grid.
   - **Edit hostDefaults**: a per-host select (claude, codex, cursor, opencode)
     listing available profiles.
   - **Edit workflowTiers**: a per-workflow select listing available tiers
     (`light`, `standard`, `deep`). The workflow list comes from the registry's
     known workflows (currently empty — the UI allows adding new workflow
     names).
   - **Regenerate**: a "Regenerate Artifacts" button calls
     `POST /api/v1/model-registry/regenerate`. Shows a spinner while running
     and success/failure on completion.
   - **Clear overlay**: a "Reset to Built-in" button calls
     `DELETE /api/v1/model-registry/overlay`. Confirm dialog.
   - **Save**: all edits are staged in the UI's in-memory overlay model. A
     "Save Overlay" button sends the full overlay to
     `PUT /api/v1/model-registry`. Validation errors from the server are
     shown inline.

### Frontend — Write-Mode Activation

7. **`isWriteModeEnabled()` refactor**: Change the default from `false` to
   `true` when the page has the `massa-ai-api-key` meta tag (i.e. the caller is
   trusted). The `MASSA_AI_WEB_WRITE_MODE=false` env flag and
   `localStorage.setItem("massa-ai-write-mode", "false")` remain as opt-out
   escape hatches. The `FORBIDDEN_MUTATING_PATHS` list is replaced with an
   allow-list approach: the UI may call any `/api/v1/*` route with the injected
   key.

8. **Create forms**: Each entity type gets a "Create" button that opens a form
   (inline or modal). Forms use the same vanilla HTML pattern as the existing
   filter bars — no new dependencies.
   - Memory create: content (textarea), type (select), importance (number
     0–1), tags (comma-separated), projectId (from the project selector).
   - Handoff create: summary (textarea), targetAgent (text), openQuestions
     (one-per-line), nextSteps (one-per-line), files (one-per-line). projectId
     from selector.
   - Checkpoint create: taskId (text), description (textarea), status (select:
     pending/in_progress/completed/failed/paused), progressPercent (number
     0–100), currentStep (text), totalSteps (number), completedSteps (number),
     checkpointType (select: manual/milestone).
   - Project index: projectPath (text), projectId (text, optional), forceReindex
     (checkbox), warmCache (checkbox).

9. **Delete buttons**: Checkpoints get a delete button per row (with confirm).
   Projects get a reset button (with confirm, and checkboxes for
   clearVectors/clearSymbols/clearMemories). Handoffs get a cancel button per
   card (with confirm).

10. **Feedback**: After every write operation, the view re-renders. On error, an
    alert or inline error message is shown (the existing pattern uses `alert()`
    for write failures).

### Frontend — Navigation

11. **Nav items**: Add "Config" and "Profiles" to the nav bar after
    "Dashboard". "Profiles" contains both the profile-switcher sub-view and
    the model-profile registry editor sub-view, toggled by a tab or sub-nav
    within the view. Update the `viewFromHash` allow-list to include `"config"`
    and `"profiles"`. Update the footer text from "Read-only" to "Admin portal ·
    served by the massa-ai Tools API".

### Security

- All new routes (`GET /api/v1/config`, `PUT /api/v1/config`,
  `POST /api/v1/checkpoints/delete`, `GET /api/v1/model-registry`,
  `PUT /api/v1/model-registry`, `POST /api/v1/model-registry/regenerate`,
  `DELETE /api/v1/model-registry/overlay`) sit behind the existing
  `authMiddleware` (not in `PUBLIC_PATHS`).
- The config GET masks sensitive fields in the response. The config PUT
  accepts masked values as "no change" — if a sensitive field comes back as
  `"***"`, the writer preserves the existing value.
- The existing `/ui` path stays in `PUBLIC_PATHS` (the shell must load without
  a key), but every `/api/v1/*` call still requires the key.
- Config write does not change the running server's API key — the
  `configuredApiKey` variable in `auth.ts` is set at `initAuth()` time and is
  not re-read. A key change requires a restart (shown in restart-needed badge).
- The model-registry overlay write path writes only to
  `~/.config/massa-ai/model-profiles.json` (user-owned, XDG config). It never
  writes to the product repo's `skills/model-profiles.json`. The regenerate
  route runs `generate-subagent-artifacts.ts` as a child process — it writes
  to `~/.claude/massa-ai/agent-profiles/` etc. (host variant directories), not
  to the repo.
- A corrupted overlay (invalid JSON, schema violation) never throws at load
  time — the loader logs a warning and falls back to the built-in registry.
  The GET route surfaces `overlayError` so the UI can show the user what is
  wrong.

### Schema / Validation

- Runtime validation for `PUT /api/v1/config` uses Elysia's `t.Object` body
  schema with optional top-level keys, each matching the `MassaAiConfig`
  section shape. Validation covers: required fields within each provided
  section, type correctness, enum values (e.g. `embedding.provider` must be one
  of the 5 providers, `logging.level` must be one of 4 levels), and numeric
  ranges (e.g. `temperature` is a number, `targetCompressionRatio` is 0–1).
- No Zod or external schema library is introduced for config validation —
  Elysia's built-in `t.*` validators (already used by every existing route)
  cover the validation needs.
- Runtime validation for `PUT /api/v1/model-registry` reuses the existing
  `validateRegistry()` from `scripts/lib/model-profiles.ts`. The route merges
  the incoming overlay over the built-in registry and runs the validator on
  the merged result — the same validator the build gate uses, so a registry
  that passes the API also passes the build. Violations are collected and
  returned together (the validator's existing "all violations at once"
  contract).
- Client-side validation for the registry editor uses the `HOST_EFFORT_ENUM`
  map (re-exported from `scripts/lib/model-profiles.ts` or duplicated in the
  frontend) to constrain effort selects per host before the save round-trip.

## Testing Decisions

### Testing Philosophy

Test external behavior, not implementation details. Every test asserts what
the user sees (HTTP response shape, rendered HTML, API call body) — never
internal function calls or module state. The existing test suites follow this
pattern: `app-renderers.test.ts` feeds fixtures to renderers and asserts HTML
output; `route-contract.test.ts` pins the UI to golden API responses;
`web-ui-contract.test.ts` pins the API to the same golden response.

### Test Seams (existing — preferred)

1. **`apps/web-ui/src/__tests__/app-renderers.test.ts`** — Pure renderer tests.
   Extend with: `renderConfigSection()` renders form inputs for each field type;
   `renderProfiles()` renders profile cards with switch buttons; the
   `renderModelRegistry()` renderer renders the profile×host×tier grid with
   overlay-sourced cells marked; create-form renderers produce the correct
   form fields.
2. **`apps/web-ui/src/__tests__/write-mode.test.ts`** — Write-mode gating tests.
   Extend with: write-mode defaults ON when API key meta tag is present; delete
   buttons render for checkpoints when write-mode on; create buttons render for
   all entity types when write-mode on; registry grid cells are editable when
   write-mode on.
3. **`apps/web-ui/src/__tests__/route-contract.test.ts`** — UI ↔ API contract
   tests. Extend with: config view sends `GET /api/v1/config` and renders the
   response; config save sends `PUT /api/v1/config` with the correct section
   body; profiles view sends `GET /api/v1/profiles` and renders the response;
   registry view sends `GET /api/v1/model-registry` and renders the grid;
   registry save sends `PUT /api/v1/model-registry` with the correct overlay
   body.
4. **`apps/tools-api/src/routes/web-ui-contract.test.ts`** — API route contract
   tests. Extend with: `GET /api/v1/config` returns masked sensitive fields and
   `restartNeededSections`; `PUT /api/v1/config` validates and rejects bad
   input; `POST /api/v1/checkpoints/delete` deletes and returns success;
   `GET /api/v1/model-registry` returns the effective registry with source
   attribution; `PUT /api/v1/model-registry` validates and rejects bad input.
5. **`apps/tools-api/src/routes/*.test.ts`** — Per-route unit tests. Add
   `config.test.ts` (GET masking, PUT validation, backup, atomic write) and
   extend `checkpoints.test.ts` with delete coverage. Add
   `model-registry.test.ts` (GET returns merged registry + source attribution +
   overlay error surfacing; PUT validates merged result via
   `validateRegistry()` and rejects violations; PUT writes atomically;
   DELETE removes the overlay file; regenerate runs the script and returns
   success/failure).
6. **`apps/web-ui/src/__tests__/index.test.ts`** — Package entrypoint marker.
   No change needed.
7. **`scripts/__tests__/model-profiles.test.ts`** — Existing registry loader
   tests. Extend with: `loadEffectiveRegistry()` merges overlay over builtin;
   tombstones remove profiles from the effective registry; a corrupted overlay
   falls back to builtin without throwing; validation failure on the merged
   result falls back to builtin.

### Test Seams (new — if needed)

8. **`apps/tools-api/src/routes/config.test.ts`** — New file for config route
   tests: GET returns masked secrets, PUT validates and rejects bad input, PUT
   creates backup before writing, PUT writes atomically, PUT preserves masked
   sensitive fields.
9. **`apps/web-ui/src/__tests__/config-forms.test.ts`** — New file for config
   form renderer tests: each section renders the correct field types, sensitive
   fields are masked with reveal toggle, save button sends the correct partial
   body.
10. **`apps/tools-api/src/routes/model-registry.test.ts`** — New file for
    model-registry route tests: GET returns merged registry with source
    attribution, GET surfaces overlay errors without failing, PUT validates
    the merged result and rejects violations, PUT writes atomically to the XDG
    path, DELETE removes the overlay and returns the builtin registry,
    regenerate spawns the script and reports success/failure.
11. **`apps/web-ui/src/__tests__/registry-editor.test.ts`** — New file for the
    registry grid editor renderer tests: grid renders all profiles as columns
    and `{host, tier}` pairs as rows, overlay-sourced cells are marked,
    tombstoned profiles appear in the restore list, effort selects are
    constrained per host, save sends the full overlay body.

### Prior Art

- `apps/web-ui/src/__tests__/write-mode.test.ts:136-191` — the existing
  write-mode gating tests are the direct template for the new create/delete
  button visibility tests.
- `apps/tools-api/src/routes/memory.test.ts` — the memory route tests are the
  template for the config route tests (mock repository, assert response shape).
- `apps/tools-api/src/routes/web-ui-contract.test.ts` — the golden-fixture
  contract test is the template for the config contract test.
- `scripts/__tests__/model-profiles.test.ts` — the existing registry validator
  tests are the template for the overlay merge + fallback tests.
- `apps/tools-api/src/routes/profiles.test.ts` — the existing profile-switch
  route tests are the template for the model-registry route tests (mock
  `loadEffectiveRegistry`, assert response shape).

## Out of Scope

- **Multi-operator / remote access with real auth**: JWT, sessions, RBAC. The
  solo local operator model uses the existing `isTrustedWebUiCaller` + API-key
  injection. Remote admin requires a separate security design.
- **Config hot-reload without restart**: V1 marks restart-needed sections and
  does not re-read config.json into the running server after a write. Hot-reload
  is a future enhancement.
- **Config diff / rollback history**: V1 creates a single `.bak.<timestamp>`
  backup before each write. A browsable history with diff and one-click rollback
  is future work.
- **Bulk operations**: Bulk delete memories, bulk reindex projects, bulk approve
  proposals. V1 is one-at-a-time.
- **Audit log viewer**: The operation log repository exists but has no UI. A
  future "Audit" view could surface it.
- **Config import/export**: Download config.json as a file, upload a config
  file. V1 is form-edit only.
- **Config schema auto-generation from TypeScript**: V1 hard-codes the form
  field definitions in `app.js` from the known `MassaAiConfig` shape. A future
  enhancement could generate forms from the TypeScript interface via reflection.
- **Project delete (vs reset)**: There is no "delete project" API — `reset` with
  all three clear flags is the closest. A true project-delete (removing the
  project from `listProjects`) is not in scope.
- **Proposal creation**: Proposals are auto-generated by the auto-improve loop.
  Manual creation is not in scope.
- **Checkpoint update (vs restore)**: Checkpoints are immutable snapshots.
  Editing a saved checkpoint is not in scope — create a new one instead.
- **Deep merge of registry overlay**: V1 uses shallow merge — a profile in the
  overlay replaces the entire built-in profile. Deep merge (patching a single
  `{host, tier}` entry without redefining the whole profile) is future work.
- **Registry overlay versioning / history**: V1 writes the overlay atomically
  with no backup. A browsable history of overlay changes with diff and
  rollback is future work.
- **Registry export/import**: Download the overlay as a file, upload an
  overlay file. V1 is grid-edit only.
- **Custom tier names**: V1 supports only the built-in `light`, `standard`,
  `deep` tiers unless the overlay replaces the entire `tiers` array. A UI
  flow for adding/renaming tiers is future work (the `tiers` field is editable
  in the overlay but not surfaced as a dedicated UI affordance in V1).

## Further Notes

- **Relationship to existing specs**: This PRD extends `.specs/features/phase-8-web-ui`
  (the original read-only web-ui) and `.specs/features/wave-7-hygiene-ui-process`
  (which spec'd write-mode + SSE + markdown). The original Phase 8 spec was
  explicitly read-only with a `R8-READONLY-01` acceptance criterion asserting no
  mutating path is reachable. This PRD supersedes that constraint — the
  read-only guarantee is replaced by a trusted-caller write-mode guarantee.
- **Relationship to `FORBIDDEN_MUTATING_PATHS`**: The existing
  `app.js:19-36` exports a `FORBIDDEN_MUTATING_PATHS` list and
  `web-ui-readonly.test.ts` (if it exists) asserts none of them appear as a
  fetch target. The read-only test must be updated or removed — the admin
  portal intentionally calls these paths.
- **Config section field count**: The 15 sections contain approximately 60
  individual fields. The form generation is the largest single piece of
  frontend work. To keep the zero-build vanilla JS approach, form field
  definitions will be declarative objects in `app.js` (one object per section,
  listing field name, type, label, and validation constraints).
- **Checkpoint delete backend gap**: The `@massa-ai/core` checkpoint
  repository may or may not expose a `delete(id)` method. This must be verified
  during implementation — if the repository lacks delete, a new
  `deleteById(id)` method must be added to the repository and a
  `DeleteCheckpointTool` wrapper created for MCP parity.
- **Config write-through backend gap**: The `@massa-ai/shared` config loader
  has no write path. The `saveConfig()` function is new surface and must be
  added to `packages/shared/src/config/`. It must handle the XDG path
  resolution, atomic write, and backup — and it must not be called at module
  import time (same lesson as `resolveApiKey()` — import-time side effects on
  config.json are a hazard for tests).
- **Restart-needed sections**: V1 hard-codes `["database", "embedding", "llm",
  "security"]` as restart-required. A future enhancement could track which
  config values are read at startup vs per-request and compute this
  dynamically.
- **Registry overlay loader gap**: `scripts/lib/model-profiles.ts`
  `loadRegistry()` reads only the built-in path. A new
  `loadEffectiveRegistry()` function must be added that reads the user
  overlay from the XDG config path
  (`~/.config/massa-ai/model-profiles.json`), merges it over the built-in
  registry with shallow-per-profile + tombstone semantics, and falls back to
  the built-in alone on overlay parse/validation failure. The existing
  `loadRegistry()` stays unchanged (the build gate still validates the
  built-in alone); `loadEffectiveRegistry()` is the new entry point for
  runtime reads.
- **Registry regenerate gap**: `POST /api/v1/model-registry/regenerate`
  runs `scripts/generate-subagent-artifacts.ts` as a child process. The
  script resolves the registry via `loadRegistry()` (built-in only) today —
  it must be updated to call `loadEffectiveRegistry()` so regenerated
  variants reflect the overlay. The script also resolves the profile via
  `selectProfile()` / `MASSA_AI_MODEL_PROFILE`; the regenerate route does
  not pass a profile flag (it regenerates all profiles the effective registry
  defines).
- **Overlay source attribution**: The `GET /api/v1/model-registry` response
  includes both the merged `registry` and the `source` object (builtin +
  overlay + tombstoned). The UI uses `source.overlay.profiles` to mark
  overlay-sourced cells. A cell is overlay-sourced when its profile key
  exists in `source.overlay.profiles` (and is not a tombstone). A profile
  absent from the overlay but present in the effective registry is
  built-in-sourced. This attribution is computed by the UI from the source
  data — the API does not annotate individual cells.
- **`generate-subagent-artifacts.ts` interface**: The regenerate route must
  inspect the script's CLI interface to determine how to invoke it as a
  child process (arguments, env vars, exit codes). If the script does not
  support a non-interactive mode or requires arguments the route cannot
  supply, the route may need to call the script's exported functions
  directly (if the script is importable from the API's runtime) rather than
  spawning a child process. This must be verified during implementation.