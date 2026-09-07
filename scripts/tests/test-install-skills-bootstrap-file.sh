#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-skills-bootstrap-file.sh
#
# Bootstrap contract delivery: the per-host MASSA-AI.md, each host's own load
# wiring, the byte-identical uninstall round trip, and the proof that --check
# and --dry-run write nothing against real OpenCode drift.
#
# Written BEFORE the installer changes it senses (tasks.md T9 → T10/T11/T13),
# so a green run here would mean the suite is asserting behaviour the installer
# already has. Requirements: BST-01, BST-02, BST-03, BST-04, BST-05, BST-12.
#
# Everything runs against a scratch home: every installer invocation carries
# --target, and $HOME itself is redirected below so a missing --target would
# still not reach the developer's real ~/.claude, ~/.codex, ~/.cursor or
# ~/.config/opencode. Scenario 9 re-reads the real home to prove it.
#
# Usage: bash scripts/tests/test-install-skills-bootstrap-file.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-skills.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-bootstrap-file.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
export PATH="$(make_mock_agents "$ROOT/bin"):$PATH"

WORK="$ROOT/work"; mkdir -p "$WORK"

# The real home, captured before the redirect, so scenario 9 can prove this
# suite left it alone.
REAL_HOME="${HOME:-}"
export HOME="$ROOT/scratch-home"
export XDG_CONFIG_HOME="$ROOT/scratch-home/.config"
mkdir -p "$XDG_CONFIG_HOME"

RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

# Read the marker literals out of the installer rather than restating them —
# same technique as test-install-skills-uninstall.sh:26.
BOOTSTRAP_START="$(grep -m1 '^BOOTSTRAP_START=' "$INSTALLER" | cut -d'"' -f2)"
BOOTSTRAP_END="$(grep -m1 '^BOOTSTRAP_END=' "$INSTALLER" | cut -d'"' -f2)"

# ── Installer runners ───────────────────────────────────────────────────────
# `run_check`, never `check`: `check` is the helper's own assertion function
# (scripts/tests/lib/installer-test-helpers.sh:23), and
# test-install-skills-check.sh:33 redefines it as an installer runner. Reusing
# that name here would make every `check LABEL RC` call below silently run the
# installer instead of asserting — and this suite does use the helper's `check`
# (scenarios 2, 8).
apply()       { bash "$INSTALLER" --apply     --platform "${2:-all}" --target "$1" --repo-root "$PROJECT_ROOT" --yes 2>&1; }
uninstall()   { bash "$INSTALLER" --uninstall --platform "${2:-all}" --target "$1" --repo-root "$PROJECT_ROOT" --yes 2>&1; }
run_check()   { bash "$INSTALLER" --check     --platform "${2:-all}" --target "$1" --repo-root "$PROJECT_ROOT" 2>&1; }
run_dry_run() { bash "$INSTALLER" --dry-run   --platform "${2:-all}" --target "$1" --repo-root "$PROJECT_ROOT" 2>&1; }

# ── Local helpers ───────────────────────────────────────────────────────────

# tree_fingerprint (installer-test-helpers.sh:67-79) with the single exclusion
# design.md:419-424 freezes for this feature: `*.massa-ai.bak-*`, and nothing
# else. Both backup writers — installer_backup_file
# (scripts/lib/installer-shared.sh:56) and opencode-config.cjs writeConfig
# (scripts/lib/opencode-config.cjs:172-176) — name their file with a UTC
# timestamp, so an unexcluded fingerprint can never be equal across a run that
# legitimately backs a file up. Widening this list past the one pattern is a
# spec change, not a test edit: an over-broad exclusion is how a
# "byte-identical" claim passes while bytes differ.
tree_fingerprint_no_backups() { # tree_fingerprint_no_backups DIR
  local root="$1"
  {
    find "$root" -name '*.massa-ai.bak-*' -prune -o -print 2>/dev/null \
      | LC_ALL=C sort | while IFS= read -r p; do
      if [ -L "$p" ]; then
        printf 'L %s -> %s\n' "${p#"$root"}" "$(readlink "$p")"
      elif [ -d "$p" ]; then
        printf 'D %s\n' "${p#"$root"}"
      else
        printf 'F %s %s\n' "${p#"$root"}" "$(shasum -a 256 "$p" | cut -d' ' -f1)"
      fi
    done
  } | shasum -a 256 | cut -d' ' -f1
}

sha_file() { shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1; }

# The first N bytes of a file, hashed. Used instead of `$(cat file)` because
# command substitution strips trailing newlines, which is exactly the byte
# class `removeBlock`'s `.trim()` (scripts/install-skills.sh:496) destroys.
sha_prefix() { # sha_prefix FILE BYTES
  head -c "$2" "$1" 2>/dev/null | shasum -a 256 | cut -d' ' -f1
}

count_backups() { find "$1" -name '*.massa-ai.bak-*' 2>/dev/null | wc -l | tr -d ' '; }

# Replace the body inside the managed marker pair, leaving every byte outside the
# pair alone. A hand-edit of exactly this shape is what --check has to notice, and
# it is the only shape that reads as drift: the engine compares marker-to-marker
# slices (scripts/install-skills.sh:604-607), so an edit *outside* the pair is
# correctly "nochange" and would make a drift assertion pass for the wrong reason.
tamper_block() { # tamper_block FILE
  "$RUNNER" - "$1" "$BOOTSTRAP_START" "$BOOTSTRAP_END" <<'NODE'
const fs = require("fs");
const [, , file, START, END] = process.argv;
const t = fs.readFileSync(file, "utf8");
const s = t.indexOf(START);
const e = t.indexOf(END, s) + END.length;
fs.writeFileSync(file, `${t.slice(0, s)}${START}\nhand-edited\n${END}${t.slice(e)}`);
NODE
}

# Drop the contract path from the OpenCode `instructions` array — the drift shape
# for the one host whose wiring is not a marker pair. Written through the
# installer's own resolver/parser so the fixture edits the file the installer
# reads.
drop_instruction() { # drop_instruction HOME
  "$RUNNER" - "$PROJECT_ROOT/scripts/lib/opencode-config.cjs" "$1/.config/opencode" "$1/.config/opencode/MASSA-AI.md" <<'NODE'
const fs = require("fs");
const [, , modulePath, dir, entry] = process.argv;
const { resolveConfigPath, parseJsonc } = require(modulePath);
const resolved = resolveConfigPath(dir);
const cfg = parseJsonc(fs.readFileSync(resolved.path, "utf8"));
cfg.instructions = (cfg.instructions || []).filter((x) => x !== entry);
fs.writeFileSync(resolved.path, `${JSON.stringify(cfg, null, 2)}\n`);
NODE
}

# Regular files that are not massa-ai backups — the residue an uninstall is
# allowed to leave is none of them (BST-05 AC-9a, AC-9b).
residue_files() { find "$1" -type f -not -name '*.massa-ai.bak-*' 2>/dev/null | LC_ALL=C sort; }

# One stat field of a path, read through $RUNNER rather than stat(1): `stat -f`
# is BSD and `stat -c` is GNU, and this suite runs on both macOS and the Linux
# CI runner. lstat, not stat — scenario 10 asks these questions about symlink
# nodes as well as regular files.
#   ino   — the inode number, the sensor for a rename-based write (design.md:454)
#   mode  — the permission bits, octal, no type bits
file_stat() { # file_stat PATH ino|mode
  "$RUNNER" - "$1" "$2" <<'NODE'
const fs = require("fs");
const [, , target, field] = process.argv;
let st;
try { st = fs.lstatSync(target); } catch { process.stdout.write("absent"); process.exit(0); }
process.stdout.write(field === "ino" ? String(st.ino) : (st.mode & 0o777).toString(8));
NODE
}

# The managed block of FILE, markers included; empty when the file has none.
managed_block() { # managed_block FILE
  "$RUNNER" - "$1" "$BOOTSTRAP_START" "$BOOTSTRAP_END" <<'NODE'
const fs = require("fs");
const [, , file, START, END] = process.argv;
let t = "";
try { t = fs.readFileSync(file, "utf8"); } catch { /* no file yet */ }
const s = t.indexOf(START);
if (s < 0) process.exit(0);
const e = t.indexOf(END, s);
if (e < 0) process.exit(0);
process.stdout.write(t.slice(s, e + END.length));
NODE
}

# Read the resolved OpenCode config through the installer's own resolution and
# JSONC parser, so a `.jsonc` fixture with comments is read the way the
# installer reads it. Shape copied from test-install-skills-state.sh:31-37;
# that suite's `state_json` hardcodes `$1/.config/massa-ai/install-state.json`
# and so cannot address this file, which is the only reason it is not reused
# verbatim.
opencode_cfg() { # opencode_cfg HOME EXPR   (EXPR evaluated with `s` bound to the doc)
  "$RUNNER" - "$PROJECT_ROOT/scripts/lib/opencode-config.cjs" "$1/.config/opencode" "$2" <<'NODE'
const fs = require("fs");
const [, , modulePath, dir, expr] = process.argv;
const { resolveConfigPath, parseJsonc } = require(modulePath);
const resolved = resolveConfigPath(dir);
const s = fs.existsSync(resolved.path) ? parseJsonc(fs.readFileSync(resolved.path, "utf8")) : {};
process.stdout.write(String(eval(expr)));
NODE
}

opencode_cfg_path() { # opencode_cfg_path HOME
  "$RUNNER" - "$PROJECT_ROOT/scripts/lib/opencode-config.cjs" "$1/.config/opencode" <<'NODE'
const { resolveConfigPath } = require(process.argv[2]);
process.stdout.write(resolveConfigPath(process.argv[3]).path);
NODE
}

# applyBootstrapState (packages/shared/src/bootstrap/engine.ts:154) against a
# scratch home, JSON report on stdout. This is the only way a shell suite can
# observe the `written-not-wired` status: the installer never emits it — the
# engine's wiring probe does (design.md:237-253).
run_engine() { # run_engine HOME
  local probe="$WORK/probe-$$-$RANDOM.ts"
  cat > "$probe" <<EOF
import { applyBootstrapState } from "$PROJECT_ROOT/packages/shared/src/bootstrap/engine.ts";
process.stdout.write(JSON.stringify(applyBootstrapState({
  targetHome: "$1",
  sourcePath: "$PROJECT_ROOT/skills/AGENTS.md",
  onWarning: () => {},
})));
EOF
  bun "$probe" 2>/dev/null
}

# Existence-and-hash probe of every path this feature can write under a home.
# Taken before the first installer run and again at the end, so scenario 9
# compares like with like: on a machine where these files legitimately exist,
# only a change made by this run is a failure.
real_home_probe() {
  local p
  for p in "$REAL_HOME/.claude/CLAUDE.md" "$REAL_HOME/.claude/MASSA-AI.md" \
           "$REAL_HOME/.codex/MASSA-AI.md" "$REAL_HOME/.cursor/MASSA-AI.md" \
           "$REAL_HOME/.config/opencode/MASSA-AI.md"; do
    if [ -e "$p" ]; then printf '%s=%s\n' "$p" "$(sha_file "$p")"
    else printf '%s=absent\n' "$p"; fi
  done
}
REAL_PROBE_BEFORE="$(real_home_probe)"

echo "Scenario 1: --apply writes a marker-delimited MASSA-AI.md for every host"
H1="$ROOT/h1"; mkdir -p "$H1"
apply "$H1" >/dev/null
for pair in "claude:$H1/.claude/MASSA-AI.md" \
            "codex:$H1/.codex/MASSA-AI.md" \
            "cursor:$H1/.cursor/MASSA-AI.md" \
            "opencode:$H1/.config/opencode/MASSA-AI.md"; do
  HOST="${pair%%:*}"; CONTRACT="${pair#*:}"
  assert_file "$HOST MASSA-AI.md written (BST-01 AC-1)" "$CONTRACT"
  assert_eq "$HOST MASSA-AI.md opens with the start marker (BST-01 AC-2)" \
    "$(head -n1 "$CONTRACT" 2>/dev/null)" "$BOOTSTRAP_START"
  assert_eq "$HOST MASSA-AI.md closes with the end marker (BST-01 AC-2)" \
    "$(tail -n1 "$CONTRACT" 2>/dev/null)" "$BOOTSTRAP_END"
  assert_contains "$HOST MASSA-AI.md carries the contract body" \
    "$(cat "$CONTRACT" 2>/dev/null)" "Coding Session Startup Contract"
done

echo ""
echo "Scenario 2: claude is wired through ~/.claude/CLAUDE.md, not AGENTS.md"
# 2a — no CLAUDE.md before the install: the installer creates it (BST-02 AC-3).
H2A="$ROOT/h2a"; mkdir -p "$H2A"
apply "$H2A" claude >/dev/null
assert_file "CLAUDE.md created when absent (BST-02 AC-3)" "$H2A/.claude/CLAUDE.md"
assert_contains "CLAUDE.md managed block imports the contract (BST-02 AC-3)" \
  "$(managed_block "$H2A/.claude/CLAUDE.md")" "@MASSA-AI.md"

# 2b — a CLAUDE.md that already exists, with leading AND trailing blank lines,
# keeps every byte it had (BST-02 AC-4). The prefix hash is the sensor: a
# `.trimEnd()`-style write (scripts/install-skills.sh:486) shortens the file
# below its original length and the hash cannot match.
H2B="$ROOT/h2b"; mkdir -p "$H2B/.claude"
printf '\n\n# My memory\n\nBe brief.\n\n\n' > "$H2B/.claude/CLAUDE.md"
USER_BYTES="$(wc -c < "$H2B/.claude/CLAUDE.md" | tr -d ' ')"
USER_SHA="$(sha_file "$H2B/.claude/CLAUDE.md")"
apply "$H2B" claude >/dev/null
assert_contains "existing CLAUDE.md gains the import (BST-02 AC-3)" \
  "$(managed_block "$H2B/.claude/CLAUDE.md")" "@MASSA-AI.md"
assert_eq "existing CLAUDE.md bytes survive unmodified (BST-02 AC-4)" \
  "$(sha_prefix "$H2B/.claude/CLAUDE.md" "$USER_BYTES")" "$USER_SHA"

echo ""
echo "Scenario 3: opencode is wired through the config's instructions array"
H3="$ROOT/h3"; mkdir -p "$H3/.config/opencode"
cat > "$H3/.config/opencode/opencode.jsonc" <<'JSONC'
{
  // a user comment, so the fixture exercises the jsonc path
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["~/my-notes.md"]
}
JSONC
apply "$H3" opencode >/dev/null
CONTRACT3="$H3/.config/opencode/MASSA-AI.md"
assert_eq "instructions holds the absolute contract path (BST-03 AC-5)" \
  "$(opencode_cfg "$H3" "(s.instructions||[]).filter(x => x === '$CONTRACT3').length")" "1"
assert_eq "the user's own instructions entry survives (BST-03 AC-5)" \
  "$(opencode_cfg "$H3" "(s.instructions||[]).includes('~/my-notes.md') ? 'yes' : 'no'")" "yes"
apply "$H3" opencode >/dev/null
assert_eq "a re-apply adds no duplicate entry (BST-03 AC-5)" \
  "$(opencode_cfg "$H3" "(s.instructions||[]).filter(x => x === '$CONTRACT3').length")" "1"

echo ""
echo "Scenario 4: codex and cursor get a pointer block, never the contract body"
for pair in "codex:$H1/.codex" "cursor:$H1/.cursor"; do
  HOST="${pair%%:*}"; HOST_ROOT="${pair#*:}"
  BLOCK="$(managed_block "$HOST_ROOT/AGENTS.md")"
  assert_contains "$HOST pointer names the contract path (BST-04 AC-6)" \
    "$BLOCK" "$HOST_ROOT/MASSA-AI.md"
  assert_eq "$HOST pointer block is at most 10 lines (BST-04 AC-6)" \
    "$([ "$(printf '%s\n' "$BLOCK" | wc -l | tr -d ' ')" -le 10 ] && echo within || echo over)" "within"
  # AC-7: the pointer states no rule of its own. These three literals are
  # policy headings of the contract body itself (skills/AGENTS.md), so their
  # presence would mean AGENTS.md became a second copy of the contract.
  assert_not_contains "$HOST pointer carries no persona policy (BST-04 AC-7)" \
    "$BLOCK" "Persona Router Policy"
  assert_not_contains "$HOST pointer carries no plan-challenge policy (BST-04 AC-7)" \
    "$BLOCK" "Plan Challenge Policy"
  assert_not_contains "$HOST pointer carries no indexing policy (BST-04 AC-7)" \
    "$BLOCK" "Indexing / Context Hygiene"
done

echo ""
echo "Scenario 5: migration empties AGENTS.md of the pre-migration full block"
H5="$ROOT/h5"; mkdir -p "$H5/.claude" "$H5/.config/opencode"
LEGACY_BLOCK="$(managed_block "$PROJECT_ROOT/skills/AGENTS.md")"
USER_HEAD=$'\n\n# Team conventions\n\nAlways rebase.\n\n'
for HOST_ROOT in "$H5/.claude" "$H5/.config/opencode"; do
  { printf '%s' "$USER_HEAD"; printf '%s\n' "$LEGACY_BLOCK"; } > "$HOST_ROOT/AGENTS.md"
done
HEAD_BYTES="$(printf '%s' "$USER_HEAD" | wc -c | tr -d ' ')"
HEAD_SHA="$(printf '%s' "$USER_HEAD" | shasum -a 256 | cut -d' ' -f1)"
apply "$H5" >/dev/null
for pair in "claude:$H5/.claude" "opencode:$H5/.config/opencode"; do
  HOST="${pair%%:*}"; HOST_ROOT="${pair#*:}"
  assert_not_contains "$HOST AGENTS.md keeps no bootstrap marker pair (BST-05 AC-8)" \
    "$(cat "$HOST_ROOT/AGENTS.md" 2>/dev/null)" "$BOOTSTRAP_START"
  assert_eq "$HOST AGENTS.md user bytes survive the migration (BST-05 AC-8)" \
    "$(sha_prefix "$HOST_ROOT/AGENTS.md" "$HEAD_BYTES")" "$HEAD_SHA"
done

echo ""
echo "Scenario 6: apply → uninstall is a byte-identical round trip"
# The fixture is the one the current engine cannot survive: files with leading
# AND trailing blank lines (removeBlock ends `.trim()`, install-skills.sh:496),
# plus ~/.cursor, a host directory that does not exist before the install and
# so must hold no file after the uninstall (BST-05 AC-9a, AC-9b).
H6="$ROOT/h6"; mkdir -p "$H6/.claude"
printf '\n\n# Team conventions\n\nAlways rebase.\n\n\n' > "$H6/.claude/AGENTS.md"
printf '\n\n# My memory\n\nBe brief.\n\n\n'            > "$H6/.claude/CLAUDE.md"
assert_no_file "cursor host dir does not exist before the install" "$H6/.cursor"
BEFORE6="$(tree_fingerprint_no_backups "$H6/.claude")"
AGENTS6_SHA="$(sha_file "$H6/.claude/AGENTS.md")"
CLAUDE6_SHA="$(sha_file "$H6/.claude/CLAUDE.md")"
apply "$H6" >/dev/null
uninstall "$H6" >/dev/null
assert_eq "the pre-existing host tree is byte-identical after uninstall (BST-05 AC-9)" \
  "$(tree_fingerprint_no_backups "$H6/.claude")" "$BEFORE6"
assert_eq "AGENTS.md is byte-identical after uninstall (BST-05 AC-9)" \
  "$(sha_file "$H6/.claude/AGENTS.md")" "$AGENTS6_SHA"
assert_eq "CLAUDE.md is byte-identical after uninstall (BST-05 AC-9)" \
  "$(sha_file "$H6/.claude/CLAUDE.md")" "$CLAUDE6_SHA"
# Nothing writes MASSA-AI.md yet, so these four pass today only because the
# file never existed; scenario 1 is what makes them mean "unlinked" once T13
# writes it.
for CONTRACT in "$H6/.claude/MASSA-AI.md" "$H6/.codex/MASSA-AI.md" \
                "$H6/.cursor/MASSA-AI.md" "$H6/.config/opencode/MASSA-AI.md"; do
  assert_no_file "uninstall unlinked $(basename "$(dirname "$CONTRACT")")/MASSA-AI.md (BST-05 AC-9b)" "$CONTRACT"
done
assert_eq "a host dir created by the install holds no file after uninstall (BST-05 AC-9a)" \
  "$(residue_files "$H6/.cursor")" ""
assert_eq "uninstall left no 0-byte residue (BST-05 AC-9a)" \
  "$(find "$H6/.claude" "$H6/.codex" "$H6/.cursor" "$H6/.config/opencode" \
       -type f -size -1c -not -name '*.massa-ai.bak-*' 2>/dev/null | LC_ALL=C sort)" ""

echo ""
echo "Scenario 7: --check and --dry-run write nothing against real OpenCode drift"
# Deliberate drift, not a synthetic equal state: the config exists, is JSONC,
# and its instructions array does NOT hold the contract path. That is precisely
# the state --check exists to find, and precisely the state a compare-then-skip
# guard writes in (design.md:449).
#
# These assertions pass on today's installer for a reason that stops holding
# once T11/T13 land: `grep -n opencode-config scripts/install-skills.sh` returns
# nothing, so no run of this installer reaches the OpenCode config at all. They
# are a regression guard on the plan modes T11 must give writeConfig, not a
# claim about today.
H7="$ROOT/h7"; mkdir -p "$H7/.config/opencode"
CFG7="$(opencode_cfg_path "$H7")"
cat > "$H7/.config/opencode/opencode.jsonc" <<'JSONC'
{
  // a user comment that a plan mode must never strip
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["~/my-notes.md"]
}
JSONC
assert_eq "the fixture really is drifted (contract path absent)" \
  "$(opencode_cfg "$H7" "(s.instructions||[]).filter(x => x.endsWith('MASSA-AI.md')).length")" "0"
BEFORE7="$(tree_fingerprint "$H7/.config/opencode")"
CFG7_SHA="$(sha_file "$CFG7")"
BAK7="$(count_backups "$H7/.config/opencode")"
run_check "$H7" opencode >/dev/null
assert_eq "--check against drift wrote nothing" "$(tree_fingerprint "$H7/.config/opencode")" "$BEFORE7"
assert_eq "--check left the config file byte-identical" "$(sha_file "$CFG7")" "$CFG7_SHA"
assert_eq "--check created no backup" "$(count_backups "$H7/.config/opencode")" "$BAK7"
run_dry_run "$H7" opencode >/dev/null
assert_eq "--dry-run against drift wrote nothing" "$(tree_fingerprint "$H7/.config/opencode")" "$BEFORE7"
assert_eq "--dry-run left the config file byte-identical" "$(sha_file "$CFG7")" "$CFG7_SHA"
assert_eq "--dry-run created no backup" "$(count_backups "$H7/.config/opencode")" "$BAK7"
assert_contains "the user's jsonc comment survived both plan modes" \
  "$(cat "$CFG7" 2>/dev/null)" "// a user comment that a plan mode must never strip"

echo ""
echo "Scenario 8: a recorded host with no wiring artifact is written-not-wired"
# The design's own population (design.md:237-246): a machine whose skills were
# installed by a plugin tarball has an install-state.json entry and has never
# had a contract file or any wiring, because no apps/*/install.sh has ever
# written one.
H8="$ROOT/h8"; mkdir -p "$H8/.config/massa-ai" "$H8/.cursor"
cat > "$H8/.config/massa-ai/install-state.json" <<EOF
{
  "version": 2,
  "repository": "$PROJECT_ROOT",
  "platforms": {
    "cursor": { "root": "$H8/.cursor", "skills": ["massa-ai"], "skillsOwner": "plugin" }
  }
}
EOF
if command -v bun >/dev/null 2>&1; then
  OUT8="$(run_engine "$H8")"; RC8=$?
  check "the engine ran against the scratch home" "$RC8"
  assert_contains "an unwired host is written-not-wired (BST-10 AC-10a)" \
    "$OUT8" '"status":"written-not-wired"'
  assert_contains "the row names the remedy (BST-10 AC-10a)" \
    "$OUT8" "scripts/install-skills.sh --apply"
  apply "$H8" cursor >/dev/null
  OUT8B="$(run_engine "$H8")"
  # `skipped`, not `written`. T8 defines `written` as a contract file whose bytes
  # this run changed on a host that is wired, and that trigger cannot fire here:
  # :377's run_engine already wrote MASSA-AI.md, and :383's --apply adds the
  # AGENTS.md wiring without changing the contract's bytes — so this second
  # engine run sees a wired host whose contract file is already up to date.
  # `skipped` still carries this scenario's claim, because an unwired host
  # reports `written-not-wired` (:379-380): a host that reports `skipped` is
  # necessarily wired. The `written` path is asserted one layer down, at
  # packages/shared/src/bootstrap/__tests__/engine.test.ts:422-431, from one real
  # engine run — re-asserting it here would duplicate coverage across layers.
  assert_contains "after --apply the same host is wired (BST-04, BST-10 AC-10a)" \
    "$OUT8B" '"status":"skipped"'
  assert_not_contains "no host is left unwired after --apply" \
    "$OUT8B" '"status":"written-not-wired"'
else
  fail "bun is required for the written-not-wired scenario and is not on PATH"
fi

echo ""
echo "Scenario 10: a symlinked wiring file is written through only when we own it"
# Numbering runs 8 → 10 → 11 → 9 deliberately. Scenario 9 re-reads the real home
# and has to stay the last thing this suite does, so a scenario appended after it
# would escape that check; renumbering it would leave the header comment above
# (line 16) naming a scenario that no longer exists.
#
# Policy under test: bootstrap_engine's write-through refusal
# (scripts/install-skills.sh:504-518), mandated by design.md:453 and decided,
# with its reasoning, at design.md:478. The shape is the one the design names —
# ~/.cursor/AGENTS.md is a link into a dotfiles repo, usually under git — and
# `cursor` is the host used throughout because its AGENTS.md is written by this
# feature both before T13 (the whole contract) and after it (the pointer block),
# so the scenario senses the same engine either way.
#
# The exit code alone would pass a guard that refuses *after* writing, so the
# assertion carrying the weight is the byte-identity of the linked-to file.

# 10a — the resolved file carries no marker pair of ours: refuse, write nothing.
HA="$ROOT/h10a"; mkdir -p "$HA/.cursor" "$HA/dotfiles"
printf '# dotfiles AGENTS.md\n\nNever rebase.\n' > "$HA/dotfiles/AGENTS.md"
ln -s "$HA/dotfiles/AGENTS.md" "$HA/.cursor/AGENTS.md"
FOREIGN_SHA="$(sha_file "$HA/dotfiles/AGENTS.md")"
OUT10A="$(apply "$HA" cursor)"; RC10A=$?
assert_eq "--apply through a foreign symlink exits non-zero (design.md:453)" \
  "$([ "$RC10A" -ne 0 ] && echo nonzero || echo zero)" "nonzero"
assert_contains "the refusal names itself on stderr (design.md:478)" \
  "$OUT10A" "Refusing to write through symlink"
assert_contains "the refusal names the path it refused (design.md:478)" \
  "$OUT10A" "$HA/.cursor/AGENTS.md"
assert_eq "the linked-to file is byte-identical after the refusal (design.md:453)" \
  "$(sha_file "$HA/dotfiles/AGENTS.md")" "$FOREIGN_SHA"
assert_symlink_to "the symlink node survives the refusal, pointing where it did" \
  "$HA/.cursor/AGENTS.md" "$HA/dotfiles/AGENTS.md"

# 10b — the complementary direction. The resolved file already carries our marker
# pair, so it is massa-ai-owned by this feature's ownership proof and must be
# written through: a refusal that also blocked this case would break every
# machine whose AGENTS.md was installed via the legacy symlink path. The planted
# block is stale, not current, so the run really has to write.
HB="$ROOT/h10b"; mkdir -p "$HB/.cursor" "$HB/dotfiles"
OWNED_HEAD=$'# dotfiles AGENTS.md\n\nNever rebase.\n\n'
STALE_BODY="a stale body from an older install"
STALE_BLOCK="$(printf '%s\n%s\n%s' "$BOOTSTRAP_START" "$STALE_BODY" "$BOOTSTRAP_END")"
{ printf '%s' "$OWNED_HEAD"; printf '%s\n' "$STALE_BLOCK"; } > "$HB/dotfiles/AGENTS.md"
OWNED_HEAD_BYTES="$(printf '%s' "$OWNED_HEAD" | wc -c | tr -d ' ')"
OWNED_HEAD_SHA="$(printf '%s' "$OWNED_HEAD" | shasum -a 256 | cut -d' ' -f1)"
ln -s "$HB/dotfiles/AGENTS.md" "$HB/.cursor/AGENTS.md"
apply "$HB" cursor >/dev/null; RC10B=$?
assert_eq "--apply through a symlink whose target carries our markers succeeds" \
  "$RC10B" "0"
assert_symlink_to "the link node survives the write-through, not replaced by a file" \
  "$HB/.cursor/AGENTS.md" "$HB/dotfiles/AGENTS.md"
assert_ne "the resolved file's managed block was replaced, not left stale" \
  "$(managed_block "$HB/dotfiles/AGENTS.md")" "$STALE_BLOCK"
assert_eq "the user's own bytes ahead of the block survive the write-through" \
  "$(sha_prefix "$HB/dotfiles/AGENTS.md" "$OWNED_HEAD_BYTES")" "$OWNED_HEAD_SHA"

# 10c — removal is exempt by design (install-skills.sh:512-514): a link whose
# target holds no block of ours is already "nochange", and refusing there would
# break uninstall on a machine that merely symlinks its AGENTS.md. Asserted so a
# later tightening of the guard reddens here instead of in a user's uninstall.
HC="$ROOT/h10c"; mkdir -p "$HC/.cursor" "$HC/dotfiles"
printf '# dotfiles AGENTS.md\n\nNever rebase.\n' > "$HC/dotfiles/AGENTS.md"
ln -s "$HC/dotfiles/AGENTS.md" "$HC/.cursor/AGENTS.md"
EXEMPT_SHA="$(sha_file "$HC/dotfiles/AGENTS.md")"
OUT10C="$(uninstall "$HC" cursor)"; RC10C=$?
assert_eq "--uninstall through a foreign symlink succeeds — removal is exempt" \
  "$RC10C" "0"
assert_not_contains "the uninstall raises no write-through refusal" \
  "$OUT10C" "Refusing to write through symlink"
assert_eq "the linked-to file is byte-identical after the uninstall" \
  "$(sha_file "$HC/dotfiles/AGENTS.md")" "$EXEMPT_SHA"
assert_symlink_to "the symlink node survives the uninstall" \
  "$HC/.cursor/AGENTS.md" "$HC/dotfiles/AGENTS.md"

echo ""
echo "Scenario 11: the block write is a temp-file-plus-rename swap"
# design.md:454. fs.writeFileSync truncates in place, so a kill or ENOSPC
# mid-write leaves the file holding a start marker with no end marker — which
# every later run, for every host, turns into a hard exit 2
# (scripts/install-skills.sh:498-503). writeAtomic
# (scripts/install-skills.sh:530-544) is what makes the swap all-or-nothing.
#
# A new inode is what proves rename() ran; the carried-forward mode is what
# proves the rename did not widen a 0600 CLAUDE.md to 0644; the absent temp file
# is what proves nothing was left behind on the way.
HD="$ROOT/h11"; mkdir -p "$HD/.cursor"
{ printf '# team AGENTS.md\n\n'; printf '%s\n' "$STALE_BLOCK"; } > "$HD/.cursor/AGENTS.md"
chmod 640 "$HD/.cursor/AGENTS.md"
MODE_BEFORE="$(file_stat "$HD/.cursor/AGENTS.md" mode)"
# Read the reference inode immediately before the run being measured, with no
# edit in between: `perl -0pi`, `sed -i` and every other rewrite-in-place tool
# installs a new inode itself, so a reference taken before one of those would be
# satisfied by any writer at all — including the plain in-place writeFileSync
# this assertion exists to reject.
INO_BEFORE="$(file_stat "$HD/.cursor/AGENTS.md" ino)"
apply "$HD" cursor >/dev/null
assert_ne "a real overwrite installs a new inode (design.md:454)" \
  "$(file_stat "$HD/.cursor/AGENTS.md" ino)" "$INO_BEFORE"
assert_eq "the pre-existing file's mode is carried forward (design.md:454)" \
  "$(file_stat "$HD/.cursor/AGENTS.md" mode)" "$MODE_BEFORE"
assert_eq "the write leaves no temp-file residue (design.md:454)" \
  "$(find "$HD/.cursor" -name '.*massa-ai.tmp-*' 2>/dev/null | LC_ALL=C sort)" ""

echo ""
echo "Scenario 12: --check reports bootstrap contract and wiring drift"
# BST-01 AC-10. Before T14, `check_platform` referenced bootstrap_op zero times,
# so AC-10's exit-0 half passed vacuously — nothing in --check could ever have
# reported a bootstrap difference, and a mutated MASSA-AI.md was invisible to it.
# Every 12a/12c assertion below therefore fails against the pre-T14 installer.
H12="$ROOT/h12"; mkdir -p "$H12"
apply "$H12" >/dev/null
run_check "$H12" >/dev/null; RC12=$?
assert_eq "a clean --apply leaves --check at exit 0 (BST-01 AC-10)" "$RC12" "0"

# 12a — the contract file. One host checked at a time, so the reported path is
# the mutated one and not a sibling's.
for pair in "claude:$H12/.claude" "codex:$H12/.codex" \
            "cursor:$H12/.cursor" "opencode:$H12/.config/opencode"; do
  HOST="${pair%%:*}"; HOST_ROOT="${pair#*:}"
  tamper_block "$HOST_ROOT/MASSA-AI.md"
  OUT12A="$(run_check "$H12" "$HOST")"; RC12A=$?
  assert_eq "$HOST contract drift exits 1 (BST-01 AC-10)" "$RC12A" "1"
  assert_contains "$HOST drift report names the contract file (BST-01 AC-10)" \
    "$OUT12A" "$HOST_ROOT/MASSA-AI.md"
done

# The quiet summary line has to agree with the exit code. --check sets verbose,
# and only a --quiet after it resets that (scripts/install-skills.sh:96-97), so
# this is the one path that reaches the summary at all: a run that exits 1 while
# printing "up to date" reports the drift it just found as its own absence.
OUT12Q="$(bash "$INSTALLER" --check --quiet --platform claude \
  --target "$H12" --repo-root "$PROJECT_ROOT" 2>&1)"
assert_contains "the quiet summary counts bootstrap drift (BST-01 AC-10)" \
  "$OUT12Q" "issues found"
assert_not_contains "a drifted host is not summarised as up to date (BST-01 AC-10)" \
  "$OUT12Q" "up to date"

# 12b — the read-only contract holds against real drift, not just against a clean
# home. This is T9's fingerprint sensor: the whole scratch home hashed before and
# after a --check that really does find something. tree_fingerprint, not the
# backup-excluding variant, so a repair-on-check would also be caught by the
# backup it would drop.
BEFORE12="$(tree_fingerprint "$H12")"
run_check "$H12" >/dev/null
assert_eq "--check against bootstrap drift wrote nothing (T9 sensor)" \
  "$(tree_fingerprint "$H12")" "$BEFORE12"

# 12c — each host's wiring artifact, on a home whose contracts are untouched, so
# the only thing that can report drift is the wiring branch itself.
H12W="$ROOT/h12w"; mkdir -p "$H12W"
apply "$H12W" >/dev/null
for pair in "claude:$H12W/.claude/CLAUDE.md" \
            "codex:$H12W/.codex/AGENTS.md" \
            "cursor:$H12W/.cursor/AGENTS.md"; do
  HOST="${pair%%:*}"; WIRING="${pair#*:}"
  tamper_block "$WIRING"
  OUT12C="$(run_check "$H12W" "$HOST")"; RC12C=$?
  assert_eq "$HOST wiring drift exits 1 (BST-01 AC-10)" "$RC12C" "1"
  assert_contains "$HOST drift report names the wiring file (BST-01 AC-10)" \
    "$OUT12C" "$WIRING"
done
# OpenCode's wiring is an `instructions` entry, not a marker pair, so it is named
# by the array it went missing from rather than by a file path.
drop_instruction "$H12W"
OUT12D="$(run_check "$H12W" opencode)"; RC12D=$?
assert_eq "opencode wiring drift exits 1 (BST-01 AC-10)" "$RC12D" "1"
assert_contains "opencode drift report names the instructions array (BST-01 AC-10)" \
  "$OUT12D" "OpenCode instructions array"

# 12d — PC-B2: a plugin-owned platform is NOT bootstrap-drift-checked. No
# apps/*/install.sh has ever written a bootstrap block (design.md:242-246), so a
# plugin-owned host has never had the contract or any wiring, and reporting that
# as drift would leave --check permanently red on every plugin install. The
# design covers that host through the toggle engine's wiring probe instead, which
# is why the branch sits INSIDE the `[ "$owner" != "plugin" ]` guard rather than
# after it. Placed after it, this scenario exits 1.
H12P="$ROOT/h12p"; mkdir -p "$H12P/.config/massa-ai" "$H12P/.cursor"
cat > "$H12P/.config/massa-ai/install-state.json" <<EOF
{
  "version": 2,
  "repository": "$PROJECT_ROOT",
  "platforms": {
    "cursor": { "root": "$H12P/.cursor", "skills": ["massa-ai"], "skillsOwner": "plugin" }
  }
}
EOF
OUT12P="$(run_check "$H12P" cursor)"; RC12P=$?
assert_eq "a plugin-owned host with no contract is not drift (PC-B2)" "$RC12P" "0"
assert_not_contains "no bootstrap drift is reported for a plugin-owned host (PC-B2)" \
  "$OUT12P" "$H12P/.cursor/MASSA-AI.md"

echo ""
echo "Scenario 9: the developer's real home was never touched"
assert_eq "the real home's contract paths are unchanged" "$(real_home_probe)" "$REAL_PROBE_BEFORE"

summary "install-skills bootstrap delivery"
