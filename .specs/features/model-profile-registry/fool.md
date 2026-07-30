# Plan Challenge — model-profile-registry

- **Gate**: full (policy `full_gate: high_risk_or_explicit` — `spec-driven` workflow, public
  compatibility surface, ~90 files)
- **Mode**: `evidence_audit` (policy `mode: auto`)
- **Why this mode**: domain mapping says architecture → pre-mortem, but the plan's entire
  justification for changing 90 shipped files is web research into four hosts' documented
  agent schemas, some flagged UNDOCUMENTED/COMMUNITY. If that evidence is wrong the plan does
  not merely under-deliver — it breaks artifacts that work today. Evidential risk dominates.
- **Delegation**: `massa-ai-plan-critic`, read-only, bounded packet (spec + design + the eight
  evidence claims + constraints + output contract). It independently re-fetched every primary
  source rather than trusting the plan's summaries.
- **Policy**: `serious_findings: revise_plan`. All valid findings revised before Tasks.

## Adjudication

The critic graded 6 of 8 claims STRONG on independent re-fetch. Three substantive findings;
two upheld, one partially upheld. **One of its grades was wrong** and is recorded here rather
than silently dropped.

| # | Critic finding | Severity | Verdict | Action |
| --- | --- | --- | --- | --- |
| A | Cursor hard-error-vs-fallback rests on a single non-authoritative forum thread; plan states it as settled | high | **UPHELD** | Certainty softened in `spec.md` §7. Falsifier is a `cursor-agent` probe; **`cursor-agent` is not installed on this machine**, recorded as a skipped sensor with reason. Decision unchanged: `inherit` is correct under *either* reading — it avoids a hard failure, and it is also what a silent fallback falls back to. |
| B | "Both global knobs override every agent" mischaracterizes the precedence chains | medium | **PARTIALLY UPHELD — critic wrong on Claude** | Verified by direct re-fetch of `code.claude.com/docs/en/model-config.md`: `CLAUDE_CODE_SUBAGENT_MODEL` **does** override frontmatter, verbatim. The critic called it a low-priority fallback; that is wrong. It was **right on Codex**: `agents.default_subagent_model` loses to the agent file. Wording split per host in `spec.md` §5 and `design.md` §1, with verbatim quotes. Conclusion (build-time resolution) unaffected. New operational caveat documented: a user setting that env var silently defeats every registry pin on Claude. |
| C | Claim 7's citation overstates `FEATURES.md`; no mutation covers rationale-vs-tier drift | medium | **UPHELD** | Citation corrected in `spec.md` §1 — only Claude and Codex tables carry a "Why" column. Replaced with sharper evidence the critic surfaced: for `navigator` those two cells are the *same sentence* ("no frontier reasoning needed") paired with a standard-tier model on Claude and a light-tier one on Codex. MPR-R11 extended so the doc-drift test compares `why` as well as `tier`; mutation row added to `design.md` §6. |
| D | Dropping the OpenCode keys closes a live shipping bug, not just hygiene, and the problem statement never names it | low | **UPHELD** | `design.md` §7 now requires the CHANGELOG to name three defect classes, the third being that `name`/`metadata` are sent to the model provider as bogus model options today under OpenCode's pass-through rule. |

### Where the critic was wrong

It graded claim 5 (`metadata: { massa-ai-owned: true }` is read by nothing) **STRONG**, stating
"repo-wide grep confirms only Claude's and Codex's install.sh reference an ownership marker —
never OpenCode's."

That is false. `apps/opencode-plugin/src/config-cli.ts:248` scopes `massa-ai-config agents
uninstall` by `content.includes("massa-ai-owned: true")`, and three tests assert it. The critic
reproduced the main agent's own earlier error — both greps were scoped to `install.sh` and
missed the second OpenCode install path. The main agent had already caught and corrected this
independently before the critique returned, by re-grepping the whole tree.

Consequence had it stood: deleting the marker would make `agents uninstall` match zero files,
print `removed 0`, and orphan 15 installed agents. The marker therefore **moves** to a body
comment instead of being deleted — see `spec.md` §4 and `design.md` §4.

**Lesson**: a delegate's *grade* needs re-measuring exactly like a delegate's *numbers*. An
independent agent confirming a convenient claim is not corroboration when both parties ran the
same too-narrow query.

## Net effect

Confidence-preserving to confidence-raising. No `critical` finding. No change to the chosen
architecture, the registry schema, or the profile-selection precedence. Changes were: two
citation corrections, one softened certainty, one requirement extended (MPR-R11), one
requirement added (MPR-R12 — a model-ID verification script, prompted by discovering that the
local `opencode` CLI can verify IDs empirically), three mutation cases added, and one
CHANGELOG obligation.

## Evidence grades after adjudication

| Claim | Grade | Basis |
| --- | --- | --- |
| 1. Cursor 5-field schema | STRONG | official docs, fetched 3× total by 3 independent parties |
| 2. Cursor needs IDs; DeepSeek/MiniMax absent from catalog | STRONG | official docs, fetched 2× |
| 3. Unresolvable Cursor model hard-errors | **WEAK** | forum only; falsifier blocked (`cursor-agent` absent); decision does not depend on it |
| 4. OpenCode has no `name:`; unknown keys pass through to provider | STRONG | official docs, fetched 2× |
| 5. OpenCode ownership marker is dead | **REFUTED** | `config-cli.ts:248` + 3 tests. Marker relocated, not deleted |
| 6. Codex fully conformant | STRONG | official docs, exact enum match |
| 7. The 3 tier splits are drift | ADEQUATE→STRONG | citation corrected; navigator same-sentence/different-tier is direct in-repo proof |
| 8. No per-agent runtime resolution | STRONG (characterization corrected) | verbatim per-host precedence chains |
| 9. OpenCode IDs resolve | **MEASURED-LOCAL** | `opencode` 1.18.9: all 3 present in 16 `opencode-go/*` ids |

Knowledge Verification Chain: step 1 codebase ✅, step 2 project docs ✅, step 3 Context7 MCP
**skipped — not registered in this session**, step 4 web ✅, plus a local-CLI empirical probe.
