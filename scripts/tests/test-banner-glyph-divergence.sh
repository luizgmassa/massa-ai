#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-banner-glyph-divergence.sh
#
# Guard against silent drift between the two duplicated banner blocks.
# The 7 glyph rows in scripts/banner.sh (lines in the massa_ai_banner
# function's cat << EOF heredoc) must be byte-identical to the 7 rows
# in install.sh (the standalone copy at the top).
#
# Additionally, verify:
# - the tagline "Memory-Augmented Semantic Search Agent" is present
# - the old "th0th" name is gone from both blocks
#
# Usage: bash scripts/tests/test-banner-glyph-divergence.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

BANNER_FILE="$PROJECT_ROOT/scripts/banner.sh"
INSTALL_FILE="$PROJECT_ROOT/install.sh"

echo "Checking banner glyph divergence and content..."
echo ""

# Extract the 7 glyph rows from scripts/banner.sh (lines 65-72 in the cat << EOF block,
# starting after the blank line and ending before the tagline)
BANNER_GLYPHS="$(sed -n '65,72p' "$BANNER_FILE")"

# Extract the 7 glyph rows from install.sh (lines 45-52 in the cat << EOF block,
# starting after the blank line and ending before the tagline)
INSTALL_GLYPHS="$(sed -n '45,52p' "$INSTALL_FILE")"

# Compare byte-for-byte
if [ "$BANNER_GLYPHS" = "$INSTALL_GLYPHS" ]; then
  ok "glyph rows are byte-identical between scripts/banner.sh and install.sh"
else
  fail "glyph rows diverged"
  echo "    --- scripts/banner.sh (lines 65-72)"
  echo "    +++ install.sh (lines 45-52)"
  diff <(echo "$BANNER_GLYPHS") <(echo "$INSTALL_GLYPHS") || true
fi

# Check for the new tagline in scripts/banner.sh (line 73: "Memory-Augmented...")
BANNER_TAGLINE="$(sed -n '73p' "$BANNER_FILE")"
case "$BANNER_TAGLINE" in
  *"Memory-Augmented Semantic Search Agent"*)
    ok "tagline 'Memory-Augmented Semantic Search Agent' present in scripts/banner.sh"
    ;;
  *)
    fail "tagline not found or wrong in scripts/banner.sh (got: '$BANNER_TAGLINE')"
    ;;
esac

# Check for the new tagline in install.sh (line 53: "Memory-Augmented...")
INSTALL_TAGLINE="$(sed -n '53p' "$INSTALL_FILE")"
case "$INSTALL_TAGLINE" in
  *"Memory-Augmented Semantic Search Agent"*)
    ok "tagline 'Memory-Augmented Semantic Search Agent' present in install.sh"
    ;;
  *)
    fail "tagline not found or wrong in install.sh (got: '$INSTALL_TAGLINE')"
    ;;
esac

# Check that "th0th" is no longer in either banner block
BANNER_CONTENT="$(sed -n '58,79p' "$BANNER_FILE")"  # massa_ai_banner function with cat << EOF
case "$BANNER_CONTENT" in
  *"th0th"*)
    fail "old 'th0th' name found in scripts/banner.sh banner block"
    ;;
  *)
    ok "old 'th0th' name is gone from scripts/banner.sh"
    ;;
esac

INSTALL_CONTENT="$(sed -n '43,57p' "$INSTALL_FILE")"  # cat << EOF block in install.sh
case "$INSTALL_CONTENT" in
  *"th0th"*)
    fail "old 'th0th' name found in install.sh banner block"
    ;;
  *)
    ok "old 'th0th' name is gone from install.sh"
    ;;
esac

summary "banner glyph divergence"
