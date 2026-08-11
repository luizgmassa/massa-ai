---
name: design
description: "Implements or updates a concrete mobile UI from structured Figma evidence or screenshots when no saved audit report exists; route comparisons to mobile-figma-audit."
license: MIT
metadata:
  version: "1.4.0"
---

### Design

Implement or update a concrete Android, iOS, or KMP Compose Multiplatform UI from structured Figma evidence or supplied screenshot context when no saved mobile Figma audit report is the source of truth. Route findings-only comparison to `mobile-figma-audit` and saved `MFM-*` remediation to `mobile-figma-fix`.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

Not for Flutter, React Native, web UI, generic Figma exploration, variable-only queries, or MCP troubleshooting.
**Reuse Scan — before writing new implementation code:** run the mandatory reuse scan per `references/code-reuse-scan.md` (separate read-only subagents; the reuse map's use/extend/new decisions are consumed before new code is planned or written) — or record its inline-fallback reason, verbatim.


1. Resolve/reuse `workflowSessionId`: `design-[entity]`.
2. Load `references/mobile-figma-matcher/repository-detection.md`, `references/mobile-figma-matcher/core.md`, `references/mobile-context.md`, `references/codebase-investigation.md`, `references/verification-ladder.md`, and `references/naming-standards.md` (before introducing or renaming identifiers, screens, components, attributes, or implementation-facing names — English-conversion rule applies). When Figma links or node IDs are provided, load `references/figma-pre-analysis.md` and run its two-stage sequential retrieval protocol before building the Figma Evidence Packet. Load `references/context-firewall.md` before large design/runtime artifacts and `references/synapse-policy.md` when repeated massa-ai searches are expected.
3. `recall` -> load current component conventions, design-system rules, approved platform/accessibility deviations, prior Figma mappings, asset pipelines, and reusable render recipes. Memory is context, not proof.
4. Require a concrete feature/module target plus at least one design source: readable Figma node/selection or supplied screenshots. Resolve required visual and interactive states plus a requirements source for behavior not represented in the design source. Ask whenever target ownership, runtime platforms, platform-frame mappings, screenshot authority, or any other important decision remains ambiguous or in doubt after source inspection.
5. Follow `references/design-implementation.md` for the Target Surface Packet, the Figma Evidence / Screenshot Context Packet, the Design-To-Code Mapping Matrix, sizing and the verification recipe, coherent-slice implementation rules, per-slice verification, completion criteria, and the completion report — the single normative copy of this direction set, shared with `spec-driven`/`feature` under Figma ingestion.
6. Persist only durable token/component mappings, approved deviations, source-set ownership rules, asset-pipeline rules, or reusable render recipes after Importance Calibration. Use `workflow:design` and required project/session/entity/memory tags.
7. Complete `references/evidence-gate.md`. Model visual judgment alone cannot satisfy completion.

**Screen work — before writing or judging any user-facing screen:** when this task creates or modifies a screen, the `massa-ai-designer` dispatch below is mandatory rather than discretionary, carved out of ordinary delegation gating by the Screen Implementation Exception in `references/agent-orchestration.md`. It does not fire when the task touches no screen surface.

> **Dispatch: `massa-ai-designer`** (role: `designer`) — charter `skills/agents/designer/SKILL.md`
> - trigger: the task creates or modifies a user-facing screen — mandatory once that condition holds, per the Screen Implementation Exception in `references/agent-orchestration.md`; it does not fire when no screen surface is touched
> - scope: the screens, views, components, layouts, styles, and design tokens in this task's UI surface — never the whole repository
> - permissions: write, scoped to UI-layer files only with a disjoint write set
> - inputs: exact `projectId`, parent `workflowSessionId`, Figma links/node ids or screenshots when supplied, acceptance criteria, the repository's existing UI conventions and design tokens, recalled screen patterns
> - sensors: Figma MCP read when a design source exists; per-element expected-vs-actual comparison; the UI module's own build/lint; the states a design under-specifies — empty, loading, error, long text, small and large sizes
> - output: per-element conformance table (element, expected, actual, verdict, severity) plus the UI files written; a missing or unreachable design source is listed as a skipped sensor, never a silent pass
> - firewall: summarized design-source evidence and `path:line` pointers only, never raw Figma node dumps or full file bodies
> - memory: suggest-only; the main agent persists durable screen and design-token conventions
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

## Examples

User asks: "Implement this Figma checkout screen in the app's SwiftUI module."

1. Detect the Xcode target and SwiftUI surface from build and source evidence.
2. Load the shared core plus SwiftUI contract, map Figma states to current styles/views/assets, implement, and verify with existing previews, snapshots, XCTest/XCUITest, or simulator sensors.

User asks: "Build this screen in our KMP app for Android and iOS."

1. Detect whether UI is shared Compose Multiplatform or native per platform.
2. Load the KMP contract for shared composables and add Android Compose, Android Views, UIKit, or SwiftUI contracts only for actual hosts/source sets.
3. Verify shared source once and runtime parity separately for Android and iOS.

User asks: "Use this screenshot as context for the Android settings screen."

1. Classify screenshot context, target surface, and uncertainty before editing.
2. Implement only visible/in-scope intent and preserve behavior requirements from separate sources.
3. Report that exact Figma parity, tokens, and variables were not evaluated.
