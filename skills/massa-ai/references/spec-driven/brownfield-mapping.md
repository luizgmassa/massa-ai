# Brownfield Onboarding — 7-Doc Codebase Mapping

Use from `workflows/spec-driven.md` when the target codebase
has not yet been mapped (brownfield, new repo, or cold project). The map is
the shared factual ground for requirements, design, and task derivation;
each doc feeds a downstream phase.

| Doc | Derives | Feeds |
| --- | --- | --- |
| `STACK.md` | languages, runtimes, frameworks, key libraries | Design constraints, verification commands |
| `ARCHITECTURE.md` | layers, modules, boundaries, data flow | Design, risk surface |
| `CONVENTIONS.md` | naming, file layout, commit/test conventions | Tasks, Execute |
| `STRUCTURE.md` | directory map, where new code goes | Tasks, file placement |
| `TESTING.md` | test runner, how to run gates, coverage tooling | Gate Check Commands, verification recipe |
| `INTEGRATIONS.md` | external services, APIs, contracts, auth | Discuss, risk escalation |
| `CONCERNS.md` | known risks, tech debt, migration landmines, security/privacy hotspots | Risk-domain escalation, validation focus |
