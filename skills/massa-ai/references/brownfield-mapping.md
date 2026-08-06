# Brownfield Onboarding — 7-Doc Codebase Mapping

Use when the target codebase has not yet been mapped (brownfield, new repo,
or cold project). The map is the shared factual ground for requirements,
design, task derivation, and gate-command discovery; each doc feeds a
downstream phase or verification step.

| Doc | Derives | Feeds |
| --- | --- | --- |
| `STACK.md` | languages, runtimes, frameworks, key libraries | Design constraints, verification commands |
| `ARCHITECTURE.md` | layers, modules, boundaries, data flow | Design, risk surface |
| `CONVENTIONS.md` | naming, file layout, commit/test conventions | Tasks, Execute |
| `STRUCTURE.md` | directory map, where new code goes | Tasks, file placement |
| `TESTING.md` | test runner, how to run gates, coverage tooling | Gate Check Commands, verification recipe |
| `INTEGRATIONS.md` | external services, APIs, contracts, auth | Discuss, risk escalation |
| `CONCERNS.md` | known risks, tech debt, migration landmines, security/privacy hotspots | Risk-domain escalation, validation focus |

## Minimum Bar

Derive at least **`CONCERNS.md`** (risk surface — drives risk-domain escalation and validation focus) and **`TESTING.md`** (gate derivation — the exact commands the workflow's verification gate will run). When time or access is constrained, these two are non-negotiable; the other five are derived as the work needs them. Confirm the map against current source, not memory or external summaries.

Output path: spec-driven work records the map under `.specs/features/<slug>/`; every other workflow records it under `.specs/project/onboarding/` (`CONCERNS.md`, `TESTING.md`).
