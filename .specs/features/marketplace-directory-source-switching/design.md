# Marketplace Directory-Source Switching — Design

Contract: `.specs/features/marketplace-directory-source-switching/spec.md`.

## Approach

Follow the loader. The engine's job is to write where the host reads, and the
host's read location is discoverable from Claude's own registry files rather
than inferable from ours. Two small, independent changes plus one retirement.

Rejected alternatives:

| Alternative | Rejected because |
| --- | --- |
| Migrate the host to the file route (`.specs/HANDOFF.md`'s staged runbook) | Sidesteps rather than fixes. The user's direction is explicitly to make the marketplace route work. It also leaves every other directory-source user broken. |
| Copy the source directory into the cache after each switch | Writes twice and still leaves the loader reading the source. The cache would drift again on the next `claude plugin update`. |
| Infer the load path by comparing directory contents | Guessing from file counts is exactly the kind of inference that produced the stale diagnosis in `.specs/HANDOFF.md`. Claude's registry states the source kind; read it. |

## D1 — resolution order in `claude-marketplace.ts`

The module gains one branch ahead of its existing logic, and keeps its
no-module-state / never-cached contract:

```
resolveClaudeMarketplaceRoot(pluginKey = "massa-ai@massa-ai")
  │
  ├─ split key            → pluginName, marketplaceName
  ├─ known_marketplaces.json[marketplaceName]
  │     └─ source.source === "directory"
  │          └─ <installLocation>/.claude-plugin/marketplace.json
  │               └─ plugins[] find name === pluginName → .source (relative)
  │                    └─ resolve against installLocation, existsSync → RETURN
  │
  └─ otherwise: installed_plugins.json[pluginKey] → selectRecord → installPath
```

Every step that cannot complete falls through to `null` (AC-01.3). The
fall-through is deliberate rather than a fallback to the cache branch: a
directory-source marketplace whose manifest is unreadable is a broken install,
and CPP-06's existing caller already reports an unresolvable root loudly. A
silent demotion to the cache would restore exactly the bug this feature fixes,
and it would do it invisibly.

The marketplace name comes from the plugin key's right-hand side (AC-01.5), not
a constant. `massa-ai@massa-ai` makes the two halves look interchangeable; they
are not, and a hardcoded `"massa-ai"` would work on this machine and nowhere
else.

## D2 — retire the stale refusal

`detectRoute`'s codex-marketplace refusal cites a checkout-dirtying risk that
AD-016 removed when bundles became gitignored generated output (spec E5). Delete
that branch; keep the absent-`installRoute` refusal, which is about an install
that never recorded its route and is still correct.

AC-02.3's sensor asserts no refusal reason in the module mentions checkout
dirtiness. That is a guard against re-introduction by copy-paste, and it is
worth stating what it cannot do: it will not catch the same premise re-appearing
under different wording. It is a tripwire on the known phrasing, not a proof.

## D3 — run both generators in the regenerate stream

`model-registry-stream.ts` spawns one script path. It gains a list, and the list
is **derived from `package.json`'s `generate:artifacts` script** rather than
hardcoded, so a future third generator is picked up by construction. Frames stay
in the existing vocabulary: one `line` stream per generator, and the terminal
`done` carries the first non-zero exit with the failing generator named
(AC-03.2).

Skills then have to reach each host's installed location (AC-03.3). The
generators write into `apps/<host>-plugin/skills/`; on the directory-source
route that **is** the tree the host reads, so D1 makes that step a no-op for
Claude. It is not a no-op for a remote-source host, and that gap is what
AC-04.1's per-host measurement exists to resolve — the design deliberately does
not guess at it ahead of the measurement.

## D4 — what the Plan Challenge Gate changed

Four findings, all accepted, listed so a reader sees which parts of this design
survived scrutiny and which were rewritten under it.

1. **AC-01.2 was a correctness claim resting on no measurement.** It now reads
   as an explicitly accepted, unmeasured risk, and MDS-05 owns closing it. The
   gate also surfaced a *third* tree this design never mentioned — the live
   clone at `~/.claude/plugins/marketplaces/<name>` that a remote-source
   marketplace keeps beside its cache. If Claude prefers that clone, the remote
   path ships the same defect. Unknown, and now written down as unknown.
2. **AC-03.4's sensor could have validated the wrong answer.** Production
   derived the generator list and the test derived it the same way, so a shared
   parser bug would make both agree on a short list and pass green — Defect B
   reintroduced through its own guard. The derivation now throws rather than
   returning a short list (AC-03.5), and a hardcoded backstop asserts ≥2 entries
   containing both known filenames (AC-03.6).
3. **Retiring the codex refusal removed a guard with nothing behind it.** E5
   measured one machine. A checkout predating AD-016, a fork made before it, or
   a deliberately committed bundle file would each be dirtied by an in-place
   rewrite. AC-02.4 adds a runtime tracked-path guard, so the removal is scoped
   by what is actually true of the user's checkout rather than by what was true
   of the author's.
4. **D1 composed a write path from manifest data with no containment check.**
   `plugins[i].source` is user-controlled relative data and this is the first
   code path turning it into a live write target. AC-01.6 requires the resolved
   path to be a descendant of `installLocation`.

The gate also *strengthened* E2: the critic compared its own live system-prompt
frontmatter against both trees and matched the source file's `disallowedTools:`
line rather than the cache's `tools:` allowlist — which would have denied it the
Task tool it was using. A running agent's own capabilities are better evidence
of the loaded tree than a file census.

## Risks

| Risk | Mitigation |
| --- | --- |
| The directory branch changes behavior for users on a remote-source marketplace | It cannot: the branch is gated on `source.source === "directory"`, and a test pins the remote path to `installPath`. Note this bounds the *change*, not the *defect* — whether the remote path was ever correct is unmeasured (AC-01.2, MDS-05). |
| `known_marketplaces.json`'s schema is undocumented and may change | Same exposure the module already accepts for `installed_plugins.json`. Every read is defensive and resolves `null` on any deviation. Recorded as an accepted risk, not a solved one. |
| Writing into a user's checkout surprises them | Measured on one machine only: the written paths are gitignored there (spec E5) and are the same paths `generate:artifacts` already writes. A checkout predating AD-016, a fork, or a deliberately committed bundle would differ — AC-02.4's runtime tracked-path guard is what makes this safe generally, not E5. |
| The generator list derived from `package.json` breaks if the script is rewritten | AC-03.5 requires the derivation to THROW rather than return a short list, and AC-03.6 adds a hardcoded backstop (>=2 entries, both known filenames). Without both, production and test derive the same wrong list and agree — passing green while skills stop shipping. |
| Retiring the codex refusal enables a switch path nobody has exercised | AC-04.1 requires measuring codex against what it actually loads before this is claimed working. |

## Reproduction

```bash
# what the host loads (directory-source marketplace)
python3 -c "import json;d=json.load(open('$HOME/.claude/plugins/known_marketplaces.json'));print(d['massa-ai'])"
ls apps/claude-plugin/agents | wc -l          # 18, includes designer

# what the switch engine writes to today
python3 -c "import json;d=json.load(open('$HOME/.claude/plugins/installed_plugins.json'));print(d['plugins']['massa-ai@massa-ai'][0]['installPath'])"
ls ~/.claude/plugins/cache/massa-ai/massa-ai/1.48.0/agents | wc -l   # 17, no designer
```
