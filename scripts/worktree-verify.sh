#!/bin/bash
# ============================================
# massa-ai - Pre-merge worktree verification
# ============================================
# Provisions a feature worktree the way a fresh clone is NOT, then runs the
# repo's gates against it and prints one comparable summary. Use it on a branch
# you are about to merge, or on any worktree you want to exercise by hand.
#
#     bash scripts/worktree-verify.sh                      # verify the cwd's worktree
#     bash scripts/worktree-verify.sh ../massa-ai-wt-foo   # verify another one
#     bash scripts/worktree-verify.sh --serve              # provision, then run the API
#     bash scripts/worktree-verify.sh --quick              # skip the slow gates
#
# Why this exists: `git worktree add` gives you a checkout with no `.env`, no
# `node_modules`, and no generated Prisma client. Three consequences bite in
# this repo specifically:
#
#   1. A test that reads config resolves the DEVELOPER'S REAL
#      ~/.config/massa-ai/config.json. On a machine with a local Ollama that
#      turns `llm.enabled` on and a unit test reaches a live model — 42 s cold,
#      0.7 s warm, against a 5 s per-test timeout. This script always runs the
#      gates under a scratch XDG_CONFIG_HOME so that cannot happen, and so a
#      config-writing test cannot chmod or add backups to your real config.
#   2. A scratch worktree has no node_modules, so every test that shells out
#      fails there. That is an environment failure, not a code failure, and it
#      has been misread as both "pre-existing" and "transient" before.
#   3. On macOS arm64 `bun install` can fail to build the native tree-sitter
#      grammars while STILL EXITING 0. This script detects the missing addons
#      and copies them from a provisioned sibling rather than reinstalling.
#
# Exit codes: 0 all selected gates green, 1 a gate failed, 2 usage/provisioning
# error. Never mutates ~/.config, never runs a destructive git command, never
# switches a branch.
# ============================================
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Options ─────────────────────────────────────────────────────────────────

TARGET=""
SERVE=0
QUICK=0
DO_INSTALL=0
KEEP_SCRATCH=0
ALLOW_DIRTY=0
FEATURE=""
DB_URL="${DATABASE_URL:-postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai}"

usage() {
  cat <<'EOF'
Usage: bash scripts/worktree-verify.sh [WORKTREE] [options]

  WORKTREE            Path to the worktree to verify (default: current directory)

  --serve             Provision, then start the API on :3333 with the scratch
                      config and print the /ui URL and its API key. Implies
                      --keep-scratch. Runs no gates.
  --quick             Only the fast gates: web-ui, shared, type-check, lint.
                      Skips tools-api, core, test:scripts and the artifact check.
  --install           Run `bun install --frozen-lockfile` if node_modules is
                      absent. Off by default: a reinstall on macOS arm64 can
                      silently drop the native grammars.
  --feature SLUG      Also run check_specs_delivered.ts for that feature slug.
  --keep-scratch      Do not delete the scratch config dir on exit (it is
                      printed either way).
  --allow-dirty       Proceed even if the worktree has uncommitted changes.
  --no-db             Skip every gate that needs PostgreSQL.
  -h, --help          This message.

Environment:
  DATABASE_URL        Overrides the default local connection string.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --serve) SERVE=1; KEEP_SCRATCH=1 ;;
    --quick) QUICK=1 ;;
    --install) DO_INSTALL=1 ;;
    --keep-scratch) KEEP_SCRATCH=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --no-db) DB_URL="" ;;
    --feature) shift; FEATURE="${1:-}"; [ -n "$FEATURE" ] || { echo "--feature needs a slug" >&2; exit 2; } ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) [ -z "$TARGET" ] || { echo "only one worktree path accepted" >&2; exit 2; }; TARGET="$1" ;;
  esac
  shift
done

# ── Colours (disabled when not a TTY, so CI logs stay readable) ─────────────

if [ -t 1 ]; then
  C_OK=$'\033[0;32m'; C_BAD=$'\033[0;31m'; C_WARN=$'\033[0;33m'
  C_DIM=$'\033[2m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_OK=""; C_BAD=""; C_WARN=""; C_DIM=""; C_B=""; C_0=""
fi

say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s%s%s\n' "$C_B" "$C_0" "$C_B" "$*" "$C_0"; }
ok()   { printf '  %s✓%s %s\n' "$C_OK" "$C_0" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_WARN" "$C_0" "$*"; }
bad()  { printf '  %s✗%s %s\n' "$C_BAD" "$C_0" "$*"; }
dim()  { printf '  %s%s%s\n' "$C_DIM" "$*" "$C_0"; }

die() { bad "$*"; exit 2; }

# ── Resolve the target worktree ─────────────────────────────────────────────

TARGET="${TARGET:-$PWD}"
[ -d "$TARGET" ] || die "not a directory: $TARGET"
TARGET="$(cd "$TARGET" && pwd)"

git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || die "not a git worktree: $TARGET"

# The repository's primary checkout — where a developer's .env actually lives.
# `git rev-parse --git-common-dir` points at <main>/.git for every linked
# worktree, so its parent is the main checkout regardless of naming.
COMMON_DIR="$(git -C "$TARGET" rev-parse --path-format=absolute --git-common-dir)"
MAIN_CHECKOUT="$(dirname "$COMMON_DIR")"

BRANCH="$(git -C "$TARGET" rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git -C "$TARGET" rev-parse --short HEAD)"

step "Target"
dim "worktree   $TARGET"
dim "branch     $BRANCH @ $HEAD_SHA"
dim "main       $MAIN_CHECKOUT"

if [ -n "$(git -C "$TARGET" status --porcelain)" ]; then
  if [ "$ALLOW_DIRTY" -eq 1 ]; then
    warn "worktree is dirty — proceeding because --allow-dirty was passed"
  else
    git -C "$TARGET" status --short | sed 's/^/    /'
    die "worktree has uncommitted changes. Commit them, or pass --allow-dirty. A gate run over an uncommitted tree is not a reading of the branch you are about to merge."
  fi
fi

# ── Provision ───────────────────────────────────────────────────────────────

step "Provisioning"

# .env — never overwrite an existing one; copy mode as well as content, since it
# holds secrets.
if [ -f "$TARGET/.env" ]; then
  ok ".env present"
elif [ -f "$MAIN_CHECKOUT/.env" ] && [ "$MAIN_CHECKOUT" != "$TARGET" ]; then
  cp -p "$MAIN_CHECKOUT/.env" "$TARGET/.env"
  ok ".env copied from the main checkout (mode preserved)"
else
  warn ".env absent and none found at $MAIN_CHECKOUT — copy .env.example and edit it if a gate needs one"
fi

# node_modules
if [ -d "$TARGET/node_modules" ]; then
  ok "node_modules present"
elif [ "$DO_INSTALL" -eq 1 ]; then
  dim "running bun install --frozen-lockfile ..."
  (cd "$TARGET" && bun install --frozen-lockfile >/dev/null) || die "bun install failed"
  ok "dependencies installed"
else
  die "node_modules absent. Re-run with --install, or copy one from a provisioned worktree. (Not automatic: a reinstall on macOS arm64 can drop the native tree-sitter grammars while still exiting 0.)"
fi

# Native tree-sitter addons. `bun install` can exit 0 having built none of them;
# the failure then surfaces much later as "No native build was found".
count_addons() { ls -d "$1"/node_modules/tree-sitter*/build 2>/dev/null | wc -l | tr -d ' '; }
TARGET_ADDONS="$(count_addons "$TARGET")"
MAIN_ADDONS="$(count_addons "$MAIN_CHECKOUT")"
if [ "$TARGET_ADDONS" -eq 0 ] && [ "$MAIN_ADDONS" -gt 0 ]; then
  warn "no native tree-sitter builds here, $MAIN_ADDONS in the main checkout — copying (the addon is N-API, so it is position-independent between identical dependency trees)"
  for d in "$MAIN_CHECKOUT"/node_modules/tree-sitter*/build; do
    pkg="$(basename "$(dirname "$d")")"
    [ -d "$TARGET/node_modules/$pkg" ] && cp -R "$d" "$TARGET/node_modules/$pkg/" || true
  done
  TARGET_ADDONS="$(count_addons "$TARGET")"
fi
if [ "$TARGET_ADDONS" -eq "$MAIN_ADDONS" ]; then
  ok "native tree-sitter builds: $TARGET_ADDONS (matches the main checkout)"
else
  warn "native tree-sitter builds: $TARGET_ADDONS here vs $MAIN_ADDONS in the main checkout — structural suites may fail for environment reasons, not code reasons"
fi

# Prisma client
if [ -d "$TARGET/packages/core/src/generated/prisma" ]; then
  ok "Prisma client generated"
else
  dim "generating Prisma client ..."
  (cd "$TARGET/packages/core" && bunx prisma generate >/dev/null 2>&1) \
    && ok "Prisma client generated" \
    || warn "prisma generate failed — core gates will likely fail"
fi

# ── Scratch config: the whole point is that nothing touches ~/.config ────────

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-verify.XXXXXX")"
mkdir -p "$SCRATCH/massa-ai"
REAL_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/massa-ai/config.json"
if [ -f "$REAL_CONFIG" ]; then
  cp "$REAL_CONFIG" "$SCRATCH/massa-ai/config.json"
  chmod 600 "$SCRATCH/massa-ai/config.json"
  ok "scratch config seeded from your real config.json (your original is not touched)"
else
  warn "no real config.json found — the scratch dir starts empty, which is what CI sees"
fi
export XDG_CONFIG_HOME="$SCRATCH"
dim "XDG_CONFIG_HOME=$SCRATCH"

cleanup() {
  if [ "$KEEP_SCRATCH" -eq 1 ]; then
    printf '\n%sscratch config kept at %s%s\n' "$C_DIM" "$SCRATCH" "$C_0"
  else
    rm -rf "$SCRATCH"
  fi
}
trap cleanup EXIT

# ── Serve mode ──────────────────────────────────────────────────────────────

if [ "$SERVE" -eq 1 ]; then
  step "Serving"
  KEY="$(bun -e 'try{const p=process.env.XDG_CONFIG_HOME+"/massa-ai/config.json";console.log(JSON.parse(require("fs").readFileSync(p,"utf8"))?.security?.apiKey??"")}catch{console.log("")}' || true)"
  say ""
  say "  Web UI    http://localhost:3333/ui"
  say "  Swagger   http://localhost:3333/swagger"
  if [ -n "$KEY" ]; then
    say "  API key   $KEY"
    say ""
    dim "curl -s -H \"x-api-key: \$KEY\" localhost:3333/api/v1/project/list"
  else
    dim "no API key in the scratch config yet — one is provisioned on first start"
  fi
  say ""
  dim "/ui is reached over loopback, so the key is injected into the page for you."
  dim "Config writes land in $SCRATCH, never in your real ~/.config/massa-ai."
  say ""
  cd "$TARGET"
  exec env DATABASE_URL="$DB_URL" bun run dev:api
fi

# ── Gates ───────────────────────────────────────────────────────────────────

FAILED=()
PASSED=()
SKIPPED=()

run_gate() {
  local name="$1"; shift
  local needs_db="$1"; shift
  if [ "$needs_db" = "db" ] && [ -z "$DB_URL" ]; then
    SKIPPED+=("$name (--no-db)"); warn "$name — skipped, needs PostgreSQL"; return 0
  fi
  printf '  %s…%s %s\n' "$C_DIM" "$C_0" "$name"
  local log; log="$(mktemp)"
  if (cd "$TARGET" && env DATABASE_URL="$DB_URL" bash -c "$*") >"$log" 2>&1; then
    PASSED+=("$name")
    local nums; nums="$(grep -Eo '^ *[0-9]+ (pass|fail)' "$log" | tr -d ' ' | tr '\n' ' ' || true)"
    [ -n "$nums" ] && ok "$name  ${C_DIM}${nums}${C_0}" || ok "$name"
    rm -f "$log"
  else
    FAILED+=("$name")
    bad "$name"
    dim "last 25 lines:"
    tail -25 "$log" | sed 's/^/      /'
    dim "full log: $log"
  fi
}

step "Gates"

run_gate "web-ui tests"        nodb 'bun test apps/web-ui/src/__tests__/'
run_gate "shared tests"        nodb 'cd packages/shared && bun test'
run_gate "type-check"          nodb 'bun run type-check --force'
run_gate "lint (oxlint)"       nodb 'npx oxlint --quiet'

if [ "$QUICK" -eq 0 ]; then
  # These runners fork a process per isolated file; a plain directory-wide
  # `bun test` here cross-contaminates module and process state and reports
  # failures that are not real.
  run_gate "tools-api suites"  db   'cd apps/tools-api && bun scripts/run-tests-isolated.ts'
  run_gate "core vector suites" db  "cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='vector|postgres|store'"
  run_gate "root scripts suites" nodb 'bun run test:scripts'
  run_gate "generated artifacts" nodb 'bun run generate:artifacts --check'
fi

# Reported, never enforced: this repo carries a long tail of legacy spec-state
# errors that are nobody's current feature. What matters is the delta.
step "State (reported, not enforced)"
STATE_OUT="$(cd "$TARGET" && bun skills/massa-ai/scripts/validate_state.ts --root . 2>&1 | tail -1 || true)"
dim "${STATE_OUT:0:160}"

if [ -n "$FEATURE" ]; then
  run_gate "specs delivered ($FEATURE)" nodb \
    "bun skills/massa-ai/scripts/check_specs_delivered.ts '$FEATURE' --root ."
fi

# ── Summary ─────────────────────────────────────────────────────────────────

step "Summary"
dim "$BRANCH @ $HEAD_SHA  ($TARGET)"
for g in "${PASSED[@]:-}";  do [ -n "$g" ] && ok  "$g"; done
for g in "${SKIPPED[@]:-}"; do [ -n "$g" ] && warn "$g"; done
for g in "${FAILED[@]:-}";  do [ -n "$g" ] && bad "$g"; done

if [ "${#FAILED[@]}" -gt 0 ]; then
  say ""
  bad "${#FAILED[@]} gate(s) failed — do not merge."
  say ""
  dim "Before assuming a code defect, rule out the two environment causes this"
  dim "script exists for: a 5001 ms timeout usually means a test reached a live"
  dim "LLM or embedding provider, and a shell-out failure usually means a"
  dim "provisioning gap. Both are already neutralised above, so a failure here"
  dim "is more likely to be real than one you hit by hand."
  exit 1
fi

say ""
ok "all selected gates green on $BRANCH @ $HEAD_SHA"
if [ "$QUICK" -eq 1 ]; then
  warn "--quick was used: tools-api, core, root scripts and the artifact check did NOT run. Not a merge-ready reading."
fi
say ""
dim "Next: bash scripts/worktree-verify.sh $TARGET --serve   # click through it by hand"
exit 0
