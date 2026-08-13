# Marketplace Directory-Source Switching — Validation

Contract: `spec.md` · Design: `design.md` · Tasks: `tasks.md`.

## T5 — per-host measurement (MDS-04) and the remote-source experiment (MDS-05)

Author-written measurement section. The independent verification verdict is a
separate section below, appended by a verifier who did not write this feature.

Measured 2026-08-13 on the reporting machine, against a repo roster of **18**
charters enumerated from `skills/agents/`.

### MDS-04 — what each host loads vs what the engine writes

| Host | `installRoute` | Engine's write target | Host's load path | Same tree? |
| --- | --- | --- | --- | --- |
| claude | `marketplace` | **was** the version-pinned cache; **now** the directory source's `apps/claude-plugin/` | `apps/claude-plugin/` (directory-source marketplace) | **was NO — this feature's Defect A**; now yes |
| codex | `file` | `~/.codex/agents` | `~/.codex/agents` | yes — no defect of this class |
| opencode | `file` | `~/.config/opencode/agents` | `~/.config/opencode/agents` | yes — no defect of this class |
| cursor | `bridge` | none — `resolveHostLayout` skips Cursor uniformly | `~/.cursor/agents` | n/a — never switched, every tier resolves to `inherit` |

"No defect of this class" is a measured finding here, not an assumption: the
file-route hosts have no marketplace indirection at all, so the wrong-target
failure mode is structurally absent for them.

### A separate defect this measurement found — installed rosters are stale

Counting files was nearly enough to miss it. Three hosts report a plausible
file count that is actually **one missing agent plus one retired orphan**:

| Location | files | missing | orphaned |
| --- | --- | --- | --- |
| `~/.codex/agents` | 18 | `massa-ai-designer` | `massa-ai-handoff-writer` |
| `~/.config/opencode/agents` | 18 | `massa-ai-designer` | `massa-ai-handoff-writer` |
| `~/.cursor/agents` | 17 | `massa-ai-designer` | — |
| `apps/claude-plugin/agents` (repo) | 18 | — | — |

Every **installed variant root** is stale the same way — the trees a profile
switch copies *from*:

| Variant root | `balanced` profile | missing |
| --- | --- | --- |
| `~/.codex/massa-ai/agent-profiles` | 17 | `massa-ai-designer` |
| `~/.config/opencode/plugins/massa-ai/agent-profiles` | 17 | `massa-ai-designer` |
| `~/.claude/plugins/cache/.../1.48.0/agent-profiles` | 17 | `massa-ai-designer` |
| `apps/claude-plugin/agent-profiles` (repo) | **18** | — |

Two distinct findings, neither of which is this feature's defect class:

1. **Nothing has refreshed the installed trees since the roster changed.** The
   mechanism to do it exists and targets the right roots for the file-route
   hosts (`syncGeneratedVariants` → `switchProfile`, both invoked by the
   regenerate stream). This is staleness from non-invocation, not a wrong
   target. It should resolve itself the first time Save & Apply runs after this
   branch lands — and that is a prediction to verify, not a claim.
2. **`massa-ai-handoff-writer` is a retired agent still installed.** It is
   absent from `skills/agents/` and from every repo bundle, yet still present in
   two hosts' active dirs. The generators prune their managed roots before
   emitting; the **installers do not appear to prune removed agents from a
   host's active directory**. Out of scope here — recorded as a finding with its
   evidence rather than patched inside a feature about write-target resolution.

### MDS-05 — remote-source load path: unmeasured, with the reason

| Marketplace | kind | clone HEAD | pinned `gitCommitSha` | diverged? |
| --- | --- | --- | --- | --- |
| `caveman` | github | `25d22f864ad6` | `25d22f864ad6` | no |
| `understand-anything` | github | `2cda14e89535` | `2cda14e89535` | no |
| `claude-plugins-official` | github | not a git repo | — | n/a |

Both remote-source marketplaces are **exactly in sync** with their pinned
caches, so no natural divergence exists on this machine to test precedence
against. Per AC-05.2 this is recorded as the reason it is unmeasured, **never as
evidence of safety**. The experiment, for whoever can run it: once a
remote-source marketplace's upstream diverges from its pinned cache version,
diff a shared-name agent file between `~/.claude/plugins/marketplaces/<name>/…`
and `~/.claude/plugins/cache/<name>/<plugin>/<version>/…`, invoke that plugin's
own agent, and compare its live frontmatter against both trees — the technique
that settled the directory case.

If the clone wins there, AC-01.2 ships the same two-trees defect for every
remote-source user, and this feature will have fixed one half of the class.
