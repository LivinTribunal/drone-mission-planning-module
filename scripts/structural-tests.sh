#!/usr/bin/env bash
# ============================================================================
# Structural Tests — Architectural Boundary Validation
#
# Validates that import dependencies between backend and frontend modules
# respect the declared layering rules:
#
#   Backend:  routes -> services -> models/schemas
#   Frontend: all API calls go through api/client.ts
#
# Also reads architecturalBoundaries from harness.config.json if populated.
#
# Exit 0: all boundaries respected.
# Exit 1: one or more violations found.
# ============================================================================
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CONFIG_FILE="${REPO_ROOT}/harness.config.json"
VIOLATIONS=0

echo "========================================="
echo "  Architectural Boundary Validation"
echo "========================================="
echo ""

# ============================================================================
# Step 1: Backend layer discipline
# routes -> services -> models/schemas (no reverse deps)
# ============================================================================
echo "--- Backend layer rules ---"

BACKEND_APP="${REPO_ROOT}/backend/app"

if [[ -d "$BACKEND_APP" ]]; then
  # routes must not import models directly
  if grep -rn "from app\.models" "${BACKEND_APP}/api/routes/" 2>/dev/null; then
    echo "::error::routes/ imports models/ directly — must go through services/"
    ((VIOLATIONS++))
  else
    echo "  routes/ does not import models/ directly"
  fi

  # routes must not import database internals
  if grep -rn "from app\.core\.database" "${BACKEND_APP}/api/routes/" 2>/dev/null; then
    echo "::error::routes/ imports database internals directly"
    ((VIOLATIONS++))
  else
    echo "  routes/ does not import database internals"
  fi

  # schemas must not import models
  if grep -rn "from app\.models" "${BACKEND_APP}/schemas/" 2>/dev/null; then
    echo "::error::schemas/ imports models/"
    ((VIOLATIONS++))
  else
    echo "  schemas/ does not import models/"
  fi

  # models must not import services
  if grep -rn "from app\.services" "${BACKEND_APP}/models/" 2>/dev/null; then
    echo "::error::models/ imports services/"
    ((VIOLATIONS++))
  else
    echo "  models/ does not import services/"
  fi

  # services must not import routes
  if grep -rn "from app\.api" "${BACKEND_APP}/services/" 2>/dev/null; then
    echo "::error::services/ imports routes/"
    ((VIOLATIONS++))
  else
    echo "  services/ does not import routes/"
  fi

  # no direct mission.status assignment outside models/ (exclude == comparisons)
  if grep -rn "mission\.status\s*=" "${BACKEND_APP}/services/" "${BACKEND_APP}/api/routes/" 2>/dev/null | grep -v "==" | grep -v "# arch-exempt" | grep -v "__pycache__"; then
    echo "::error::direct mission.status assignment found outside models/ - use Mission.transition_to() or Mission.invalidate_trajectory()"
    ((VIOLATIONS++))
  else
    echo "  no direct mission.status assignment outside models/"
  fi
else
  echo "  (backend/app/ not found, skipping backend checks)"
fi

echo ""

# ============================================================================
# Step 2: Frontend API client discipline
# All axios usage must go through api/client.ts
# ============================================================================
echo "--- Frontend API client rules ---"

FRONTEND_SRC="${REPO_ROOT}/frontend/src"

if [[ -d "$FRONTEND_SRC" ]]; then
  while IFS= read -r file; do
    rel="${file#"$REPO_ROOT"/}"
    # skip the api/ directory itself and node_modules
    [[ "$rel" == *"api/"* ]] && continue
    [[ "$rel" == *"node_modules"* ]] && continue
    echo "::error file=${rel}::direct axios import outside api/ — use api/client.ts"
    ((VIOLATIONS++))
  done < <(grep -rl "from ['\"]axios['\"]" "$FRONTEND_SRC" 2>/dev/null || true)

  if (( VIOLATIONS == 0 )); then
    echo "  all API calls go through api/client.ts"
  fi
else
  echo "  (frontend/src/ not found, skipping frontend checks)"
fi

echo ""

# ============================================================================
# Step 3: harness.config.json architecturalBoundaries (if populated)
# ============================================================================
echo "--- harness.config.json boundaries ---"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "  (harness.config.json not found, skipping)"
else
  BOUNDARY_COUNT=$(python3 -c "
import json
config = json.load(open('${CONFIG_FILE}'))
print(len(config.get('architecturalBoundaries', {})))
")

  if (( BOUNDARY_COUNT == 0 )); then
    echo "  no explicit architecturalBoundaries defined (relying on layer rules above)"
  else
    echo "  ${BOUNDARY_COUNT} module boundaries found — validating..."

    python3 -c "
import json, subprocess, sys, os

config = json.load(open('${CONFIG_FILE}'))
boundaries = config.get('architecturalBoundaries', {})
violations = 0

for module, rules in boundaries.items():
    allowed = set(rules.get('allowedImports', []))
    module_dir = os.path.join('${REPO_ROOT}', module)
    if not os.path.isdir(module_dir):
        continue

    for root, _, files in os.walk(module_dir):
        for fname in files:
            if not fname.endswith('.py') and not fname.endswith('.ts'):
                continue
            fpath = os.path.join(root, fname)
            with open(fpath) as f:
                for i, line in enumerate(f, 1):
                    for other_mod in boundaries:
                        if other_mod == module:
                            continue
                        if other_mod in line and other_mod not in allowed:
                            rel = os.path.relpath(fpath, '${REPO_ROOT}')
                            print(f'::error file={rel},line={i}::{module} imports {other_mod} (allowed: {allowed or \"none\"})')
                            violations += 1

if violations > 0:
    print(f'{violations} boundary violation(s) from harness.config.json')
    sys.exit(1)
else:
    print(f'  all {len(boundaries)} module boundaries respected')
"
    boundary_exit=$?
    if (( boundary_exit != 0 )); then
      ((VIOLATIONS++))
    fi
  fi
fi

echo ""

# ============================================================================
# Step 4: Report results
# ============================================================================
if (( VIOLATIONS > 0 )); then
  echo "Found ${VIOLATIONS} architectural boundary violation(s)"
  echo ""
  echo "To fix: update the import to respect the layer rules, or update"
  echo "architecturalBoundaries in harness.config.json if the dependency is intentional."
  exit 1
else
  echo "All architectural boundaries respected"
fi
