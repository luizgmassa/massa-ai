# Project Identity Rename Specification

Slug: `project-identity-rename`. Source: `rename-the-entire-project-quiet-torvalds.md`.

## Requirements

- Package scope is `@massa-ai` (renamed from `@massa-th0th` in the subsequent `repo-rename-massa-ai` feature); configuration type is `MassaAiConfig`; project variables use `MASSA_AI_*`.
- Runtime server identity is `massa-ai` and MCP tools remain unprefixed.
- New functionality preserves scoped package resolution and current storage/config conventions.
- Retained subsystem names such as `RLM_LLM_*` are intentional compatibility boundaries.
  **Superseded by AD-010** (`audit-remediation-2026-07`, DEBT-03): the project now has exactly one
  env prefix, `MASSA_AI_`, and `RLM_LLM_*` is hard-renamed with no dual-read.

## Deviations and Out of Scope

The plan proposed prefixed tool names and different data/install/env names; verified implementation differs as detailed in `design.md`. External platform rename and existing-user migration are out of scope.

## Verification Approach

Rename commits `09713f4` and `346f718` plus current-tree identity inspection; no fresh full rename migration was run.
