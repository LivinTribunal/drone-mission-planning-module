#!/usr/bin/env bash
# ============================================================================
# Migration Integrity Check
#
# Validates alembic migration chain for common issues that arise when
# multiple branches add migrations concurrently:
#
#   1. Duplicate revision IDs across files
#   2. Cycles in the revision graph
#   3. Multiple unmerged heads
#
# Exit 0: migration chain is healthy.
# Exit 1: one or more issues found.
# ============================================================================
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MIGRATIONS_DIR="${REPO_ROOT}/backend/migrations/versions"
VIOLATIONS=0

echo "========================================="
echo "  Migration Integrity Check"
echo "========================================="
echo ""

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "  (migrations directory not found, skipping)"
  exit 0
fi

# ============================================================================
# Step 1: Duplicate revision IDs
# ============================================================================
echo "--- Checking for duplicate revision IDs ---"

duplicates=$(grep -rh '^revision: str = ' "$MIGRATIONS_DIR"/*.py 2>/dev/null \
  | sed 's/revision: str = "\(.*\)"/\1/' \
  | sort | uniq -d || true)

if [[ -n "$duplicates" ]]; then
  for dup in $duplicates; do
    files=$(grep -rl "^revision: str = \"${dup}\"" "$MIGRATIONS_DIR"/*.py)
    echo "::error::duplicate revision ID '${dup}' in:"
    echo "$files" | while read -r f; do echo "    $(basename "$f")"; done
    ((VIOLATIONS++))
  done
else
  echo "  no duplicate revision IDs"
fi

echo ""

# ============================================================================
# Step 2: Cycle detection and head count via alembic
# ============================================================================
echo "--- Checking migration graph (cycles, heads) ---"

cd "${REPO_ROOT}/backend"

heads_output=$(python3 -c "
import sys
from alembic.config import Config
from alembic.script import ScriptDirectory

try:
    c = Config('alembic.ini')
    s = ScriptDirectory.from_config(c)
    heads = list(s.get_heads())
    print('HEADS:' + ','.join(heads))
except Exception as e:
    err = str(e)
    if 'Cycle' in err or 'cycle' in err:
        print('CYCLE:' + err, file=sys.stderr)
        sys.exit(1)
    raise
" 2>&1) || {
  echo "::error::cycle detected in migration graph"
  echo "  $heads_output"
  ((VIOLATIONS++))
  heads_output=""
}

if [[ -n "$heads_output" && "$heads_output" == HEADS:* ]]; then
  heads="${heads_output#HEADS:}"
  head_count=$(echo "$heads" | tr ',' '\n' | wc -l | tr -d ' ')

  if (( head_count > 1 )); then
    echo "::error::${head_count} unmerged migration heads detected: ${heads}"
    echo "  run: cd backend && alembic merge heads -m 'merge migration heads'"
    ((VIOLATIONS++))
  else
    echo "  single head: ${heads}"
  fi
fi

echo ""

# ============================================================================
# Step 3: Report results
# ============================================================================
if (( VIOLATIONS > 0 )); then
  echo "Found ${VIOLATIONS} migration integrity issue(s)"
  echo ""
  echo "Common fixes:"
  echo "  - duplicate IDs: rename the newer file and update its revision inside the file"
  echo "  - multiple heads: alembic merge heads -m 'merge migration heads'"
  echo "  - cycles: check down_revision pointers for loops"
  exit 1
else
  echo "Migration chain is healthy"
fi
