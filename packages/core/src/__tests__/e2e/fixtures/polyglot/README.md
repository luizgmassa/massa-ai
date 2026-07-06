# Polyglot E2E Fixture

Tiny fixture for T4 (Symbol graph) edges E8–E11. Indexed into a per-run
`e2e-th0th-poly-${RUN_STAMP}` project so the suite stays read-only against the
shared index.

Files:
- `decorator-heavy.ts` — E8: decorator-heavy TS.
- `indent-method.py` — E8/E9: deeply-nested (indent 8) Python method.
- `poly.dart` — E9: Dart, symbols but no imports (PageRank-disconnected).
- `poly.kt` — E9 supplementary Kotlin.
- `tsconfig.json` — E10: trailing-comma `paths` (silent alias-skip).
- `unresolvable-import.ts` — E10 supplementary: unresolvable relative import.
- `poly.go`, `poly.rs` — E11: unsupported extensions (zero symbols).
- `README.md` — this file (also an unsupported extension for symbol extraction).
