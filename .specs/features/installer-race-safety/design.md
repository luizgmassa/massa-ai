# M19 — Installer Race Safety Design

Use a small sourceable Bash library so production installer and deterministic shell tests share one implementation. Candidate and metadata temporaries live beside `.env`, enabling same-filesystem atomic `mv`. Portable metadata collection uses platform-specific `stat` formats behind one adapter; SHA-256 selects `shasum -a 256` or `sha256sum`.

Lock acquisition uses atomic `mkdir`. `owner` is written inside the lock with hostname, PID, process-start identity, random token, and timestamp. Contenders reclaim only when metadata is valid, age exceeds the stale threshold, host matches, and both PID absence and process-start mismatch prove death. Remote/uncertain owners time out.

Before mutation, validate `.env` and `.env.bak` types and compare the complete snapshot. Publish backup through a same-directory temp, verify digest, then rename; publish candidate last. Signal cleanup is token-scoped. No semantic fallback.
