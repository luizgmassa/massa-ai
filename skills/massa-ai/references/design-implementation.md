# Design-To-Code Implementation Direction

The single normative copy of the mobile UI implementation direction set:
Target Surface Packet, Figma Evidence / Screenshot Context Packet, the
Design-To-Code Mapping Matrix, coherent-slice implementation rules, and
per-slice verification/completion criteria.

Loaded by `workflows/design.md` for its direct route (behavior unchanged),
and by `spec-driven`/`feature` when Figma ingestion is enabled, so those
workflows absorb this direction set by reference instead of restating it.

## Target Surface Packet

Build the immutable Target Surface Packet before loading stack guidance.
Classify each selected surface and load only its contracts:

- Android Views XML -> `references/mobile-figma-matcher/android-views.md`.
- Android Jetpack Compose -> `references/mobile-figma-matcher/android-compose.md`.
- iOS UIKit -> `references/mobile-figma-matcher/ios-uikit.md`.
- iOS SwiftUI -> `references/mobile-figma-matcher/ios-swiftui.md`.
- Shared KMP Compose Multiplatform -> `references/mobile-figma-matcher/kmp-compose-multiplatform.md`
  plus native contracts only for selected native source sets, hosts,
  wrappers, or runtime targets.

Non-mobile targets under Figma ingestion do not have a matcher contract to
classify against; proceed with the wiring recorded in `references/figma-wiring.md`
and a best-effort implementation contract, and record that class explicitly.

## Figma Evidence / Screenshot Context Packet

Build the Figma Evidence Packet with metadata when needed, design context,
screenshot, variables, current Code Connect mappings, variants/states,
annotations, and asset inventory. For screenshot-only sources, build a
Screenshot Context Packet with provenance, target state, visible constraints,
uncertainty, and `Design Evidence Class: screenshot-context-only`; do not
infer exact Figma tokens, dimensions, variables, variants, or parity from
screenshots alone. Stop if neither structured Figma evidence nor supplied
screenshot context is available.

## Design-To-Code Mapping Matrix

Resolve current components, tokens, resources, assets, source-set ownership,
platform adapters, requirements, and existing validation sensors. Create the
Design-To-Code Mapping Matrix and one comparison configuration per selected
runtime surface; screenshot-only rows use inferred visual intent, not
`Figma Value`.

## Sizing And Verification Recipe

Size the work with the Verification Ladder. Route broad application work,
unresolved architecture, cross-feature design-system migration, or
implementation that won't fit one clean context window to `spec-driven`.

Establish the verification recipe before editing. Protect tests, snapshots,
screenshot baselines, fixtures, previews, accessibility identifiers, test
tags, and automation flows from weakening.

## Coherent-Slice Implementation Rules

Implement coherent slices using the smallest correct ownership boundary:

- Reuse existing components and tokens only after resolving semantics,
  states, accessibility, and values.
- Save required temporary Figma-served assets into the repository's existing
  durable asset pipeline before referencing them.
- Keep shared KMP UI in common source sets only when ownership is genuinely
  shared; keep platform UI and adapters explicit.
- Apply shared KMP root fixes before platform-local overrides when the cause
  is shared.
- Preserve platform accessibility, safe areas/insets, localization, adaptive
  behavior, and native conventions.

## Per-Slice Verification

After each coherent slice, rebuild affected mapping/comparison rows and run
the cheapest deterministic sensors. When a shared KMP change affects Android
and iOS, verify both requested targets or mark the unavailable platform
`NOT EVALUATED`.

## Completion Criteria

Refresh the Figma node, when available, and all selected target surfaces
before completion. Completion requires zero unresolved selected `MISMATCH`
rows for structured Figma evidence; `NOT EVALUATED` rows remain explicit
residual risk and prohibit complete parity claims. Screenshot-only
completion may claim implementation against supplied screenshot context,
never exact Figma parity.

## Completion Report

Report changed files, final per-surface matrix, saved assets, strongest
verification level, skipped checks, and residual risk.
