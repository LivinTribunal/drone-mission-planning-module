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

# prefer backend venv python if available, else system python3
PY="python3"
if [[ -x "${REPO_ROOT}/backend/.venv/bin/python" ]]; then
  PY="${REPO_ROOT}/backend/.venv/bin/python"
elif [[ -x "${REPO_ROOT}/backend/venv/bin/python" ]]; then
  PY="${REPO_ROOT}/backend/venv/bin/python"
fi

# exit codes from the helper:
#   0 = success (HEADS:... on stdout)
#   1 = real cycle in the migration graph
#   2 = alembic not installed (skip with warning)
set +e
heads_output=$("$PY" - <<'PY' 2>&1
import sys
try:
    from alembic.config import Config
    from alembic.script import ScriptDirectory
except ModuleNotFoundError:
    sys.exit(2)

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
PY
)
helper_exit=$?
set -e

if (( helper_exit == 2 )); then
  echo "  (alembic not installed in $PY - skipping cycle/heads check)"
  echo "  to enable locally: cd backend && pip install -r requirements.txt"
  heads_output=""
elif (( helper_exit != 0 )); then
  echo "::error::cycle detected in migration graph"
  echo "  $heads_output"
  ((VIOLATIONS++))
  heads_output=""
fi

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
