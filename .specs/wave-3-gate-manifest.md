# Wave 3 Gate Manifest

## Frozen Baseline

- Branch: `wave-3`
- Base: `main@c92e481`
- Install: `bun install --frozen-lockfile`
- Final commands: `bun run test`, `bun run type-check`, `bun run build`
- Before PR: integrate current `main`, rerun every final gate, then make no code changes.

## Execution Controls

- One active feature at a time; each implementation task ends in an atomic commit.
- Every feature uses a fresh read-only investigator, bounded sequential implementer, and independent verifier.
- Paired milestones split at contract boundaries when investigation exceeds one coherent task or about eight tasks.
- Mandatory PostgreSQL, platform, native, package, or Docker gates cannot be waived.

## Early Linux Feasibility Checkpoint

M21 packaging remains last, but its no-code Debian 12 x64 feasibility runs before broad Wave 3 implementation can be called low-risk. Evidence must freeze Bun, Node/npm, native ABI, all native dependency identities, patch SHA-256, glibc 2.36, 33 fixture parses, 27 module loads, linkage, and ten lifetime sensors. A true Linux x64 runner is authoritative; emulated Docker is supplemental. Failure blocks M21 and Wave 3 completion.

## Integration Dependencies

- M20/M54 freezes transport and registry cursor contracts before M50 MCP envelopes.
- M50 persistence validation precedes identity rewrites.
- M16/M17 freezes every writer/reference adapter and PostgreSQL lock protocol before apply.
- M45/M47 consumes durable identity aliases and invalidation behavior.
- M21 reruns source, built distribution, packed consumer, and Docker gates against the final integrated branch.
