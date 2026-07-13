#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SETUP_SCRIPT="${PROJECT_ROOT}/scripts/setup-local-first.sh"

PASS=0
FAIL=0

ok() { echo "  ok - $*"; PASS=$((PASS + 1)); }
fail() { echo "  not ok - $*"; FAIL=$((FAIL + 1)); }

assert_contains() {
    local label="$1" pattern="$2"
    if grep -Eq "$pattern" "$SETUP_SCRIPT"; then ok "$label"; else fail "$label"; fi
}

assert_absent() {
    local label="$1" pattern="$2"
    if grep -Eq "$pattern" "$SETUP_SCRIPT"; then fail "$label"; else ok "$label"; fi
}

echo "PostgreSQL-only setup wizard tests"

if bash -n "$SETUP_SCRIPT"; then ok "setup script has valid bash syntax"; else fail "setup script has valid bash syntax"; fi

assert_contains "native PostgreSQL choice exists" 'Native PostgreSQL'
assert_contains "Docker PostgreSQL choice exists" 'Docker PostgreSQL'
assert_contains "native backend override exists" 'native\) DB_CHOICE=1'
assert_contains "Docker backend override exists" 'docker\) DB_CHOICE=2'
assert_contains "invalid interactive choice fails closed" 'Invalid database selection'
assert_contains "database URL is validated" 'require_postgres_database_url "\$DATABASE_URL"'
assert_contains "migrations fail closed" 'bunx prisma migrate deploy \|\| die'
assert_contains "pgvector is verified after migrations" "pg_extension WHERE extname = 'vector'"
assert_absent "no optional PostgreSQL switch remains" 'USE_POSTGRES'
assert_absent "no fallback message remains" 'Falling back'

echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
