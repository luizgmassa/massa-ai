# Project Context Intake

Use this reference at the start of every workflow, before the first substantive
read, edit, plan, or answer. It defines the minimum project-context sweep that
makes agent behavior match this repository's actual conventions instead of
generic defaults.

## Principle

Host and project instruction files are the highest-precedence description of how
work is done here. Reading them is cheaper than discovering their rules by
failing a gate. Read them once per session, honor precedence, and never re-read
what is already loaded.

## Intake Sweep

Read in this order. Stop at the first tier that answers the current question;
continue only when the next decision still needs more.

| Tier | Sources | Answers |
| --- | --- | --- |
| 1 — Agent contract | `AGENTS.md`, `CLAUDE.md`, and any nearest-ancestor copy between the repo root and the working directory | Startup contract, routing, mandatory policies, forbidden actions |
| 2 — Host config | `.claude/` (`settings.json`, `settings.local.json`, `commands/`, `agents/`, `skills/`, `hooks/`), `.cursor/` (`rules/`, `mcp.json`), `.github/copilot-instructions.md`, `.opencode/`, `.codex/` | Permissions, hooks, host-specific tooling, MCP registrations |
| 3 — Product docs | `README.md`, `CONTRIBUTING.md`, `docs/`, `ARCHITECTURE.md` | Install/run/build surface, contribution protocol, architecture |
| 4 — Delivery config | `.github/workflows/`, `CHANGELOG.md`, `package.json` / `Cargo.toml` / `build.gradle*` / `pyproject.toml`, `.tool-versions`, `mise.toml`, `Makefile` | CI gates, release rules, runtime and toolchain pins, task commands |
| 5 — Live state | `.specs/project/STATE.md`, `.specs/project/FEATURES.json`, `.specs/HANDOFF.md`, `.specs/lessons.json` (single store; `lessons list` is the on-demand view) | In-flight work, decisions already made, confirmed lessons |

Tier 1 and Tier 3 (`README.md`) are mandatory in every workflow. Tiers 2, 4, and
5 are read when the task touches host tooling, a gate/release surface, or
in-flight spec work respectively.

## Precedence

When two sources conflict, the higher tier wins:

1. Explicit user instruction in the current turn.
2. System/developer instructions.
3. Nearest-ancestor `AGENTS.md` / `CLAUDE.md` (deeper path beats repo root).
4. Repo-root `AGENTS.md` / `CLAUDE.md`.
5. `CONTRIBUTING.md`, then `README.md`, then `docs/`.
6. Current repository source code.
7. Recalled memory — context only, never canonical.

A conflict between a doc and current source is a finding: report it rather than
silently picking a side.

## Dedupe Guard

- Run the sweep once per conversation. Record which tiers were read.
- Do not re-read a file because a later workflow or reference names it.
- On a `git pull`, branch switch, or worktree change, re-read Tier 1 and Tier 4 only.
- Loading a file is not the same as applying it — state which rule you took from it.

## Size And Hygiene

- Apply `references/context-firewall.md` thresholds to every file in the sweep.
  A `README.md` over 200 lines is summarized, not pasted.
- Honor the global ignore paths from the `AGENTS.md` bootstrap block. Never index
  or read `node_modules/`, `dist/`, `build/`, `target/`, `.venv/`, `.env*`,
  `*.pem`, `*.key`, `.ssh/`, or `secrets.json` during intake.
- Never echo secrets found in a config file. Report the key name only.

## Failure Handling

| Condition | Behavior |
| --- | --- |
| File absent | Record it as absent and continue. Absence is evidence, not an error. |
| No `AGENTS.md` and no `CLAUDE.md` | Say the project has no agent contract; fall back to `README.md` + `CONTRIBUTING.md`. |
| Not a repository | Skip Tiers 4 and 5; run Tiers 1–3 against the working directory. |
| Conflicting nested contracts | Apply the nearest ancestor, and report the divergence once. |
| Sweep would exceed the context budget | Summarize per file to its rules-that-apply, and name what was summarized. |

## Output

Report the sweep in one line: which tiers were read, and the rules taken from
them that change this task's behavior. Do not restate file contents.
