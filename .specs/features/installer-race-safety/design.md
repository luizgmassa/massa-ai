# M19 — Installer Race Safety Design

Use a small sourceable Bash library so production installer and deterministic shell tests share one implementation. Candidate and metadata temporaries live beside `.env`, enabling same-filesystem atomic `mv`. Portable metadata collection uses platform-specific `stat` formats behind one adapter; SHA-256 selects `shasum -a 256` or `sha256sum`.

Lock acquisition uses atomic `mkdir`. `owner` is written inside the lock with hostname, PID, process-start identity, random token, and timestamp. Contenders reclaim only when metadata is valid, age exceeds the stale threshold, host matches, and both PID absence and process-start mismatch prove death. Remote/uncertain owners time out.

Before mutation, validate `.env` and `.env.bak` types and compare the complete snapshot. Publish backup through a same-directory temp, verify digest, then rename; publish candidate last. Signal cleanup is token-scoped. No semantic fallback.

The shared protocol is used by `install.sh::write_env` and the source-mode `scripts/setup-local-first.sh` `.env` writer. `config.json` keeps its existing path because M19 is specifically the installer `.env` race contract.

Recovery states are explicit: before backup, target and backup stay unchanged; after backup but before publish, target is old and backup matches it; after publish, target is the complete candidate and backup is the exact predecessor. SIGKILL may leave owned lock/temp artifacts, which a later process reclaims only after proving the recorded owner dead. Same-directory rename is atomic visibility, not a claim of power-loss durability.
