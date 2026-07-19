# M19 — Installer Race Safety Specification

## Requirements

- M19-R1: Both user-visible installer `.env` writers build the candidate before acquiring a same-directory installer lock.
- M19-R2: Snapshot existing `.env` by device, inode, type, size, mtime, symlink state, and SHA-256 digest. Reject initial or swapped symlink/non-regular `.env` and `.env.bak` targets.
- M19-R3: Lock ownership records host, PID, process-start identity, random token, and timestamp. Reclaim only a stale lock whose owner is proven dead. Cleanup removes only the caller's lock.
- M19-R4: Under lock, revalidate the snapshot, atomically publish and verify `.env.bak`, then atomically rename the candidate to `.env`.
- M19-R5: Mismatch, timeout, or interruption leaves `.env` unchanged and removes caller-owned temporary files.

## Acceptance Criteria

- AC1: Two concurrent installers serialize without torn `.env` or backup.
- AC2: External edit or inode replacement between snapshot and publish aborts without replacing `.env`.
- AC3: Initial and lock-time swapped symlink/non-regular `.env` or `.env.bak` abort.
- AC4: A SIGKILL-created stale lock is reclaimed only after owner death is proven.
- AC5: Successful replacement leaves `.env.bak` byte-identical to the prior `.env`.
- AC6: TERM/INT cleanup removes only owned candidate, backup temp, and lock artifacts.
- AC7: The focused harness passes on macOS and Debian; unavailable mandatory platform evidence blocks completion.
- AC8: A staged candidate changed after its initial digest is rejected, and SIGKILL recovery from each publish state never exposes a partial target.

## Out of Scope

- `config.json` transactionality.
- `scripts/install-agents.ts` configuration writes.
- Cross-directory or distributed locking.
- Power-loss durability: same-filesystem rename guarantees atomic visibility, but pure portable Bash cannot promise file-and-directory `fsync` ordering on macOS and Debian.
- Relaxing existing installer inputs or PostgreSQL validation.
