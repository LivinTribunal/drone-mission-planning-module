#!/usr/bin/env bash
# ============================================================================
# Risk Policy Gate — Preflight CI gate for PR risk classification
#
# Determines the risk tier and required CI checks for a pull request.
# Exit 0: gate passed (tier and checks computed for downstream jobs).
# Exit 1: hard failure (SHA mismatch, unrecoverable error).
#
# Environment variables (set by CI workflow):
#   EXPECTED_SHA  — PR head SHA from the CI event payload
#   BASE_REF      — PR base branch name (default: main)
#   STRICTNESS    — relaxed | standard | strict (default: standard)
#   GITHUB_OUTPUT — path to GitHub Actions output file (set by runner)
#   GITHUB_REPOSITORY — owner/repo (set by runner)
# ============================================================================
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CONFIG_FILE="${REPO_ROOT}/harness.config.json"
STRICTNESS="${STRICTNESS:-standard}"

# --- Globals populated during execution ---
VERIFIED_SHA=""
MAX_TIER=0
TIER1_FILES=()
TIER2_FILES=()
TIER3_FILES=()
REQUIRED_CHECKS=()
DOCS_DRIFT_DETECTED=false
DOCS_DRIFT_WARNING=""
REVIEW_RESULT="skipped"

# ============================================================================
# Config Reader Utility
# Reads harness.config.json and extracts tier patterns.
# Falls back to hardcoded defaults if the config is missing or malformed.
# ============================================================================
T3_PATTERNS=()
T2_PATTERNS=()
T1_PATTERNS=()
DOCS_TRACKED=()
DOCS_EXEMPT=()

load_config() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "::warning::harness.config.json not found — using built-in defaults"
    # hardcoded defaults matching the project's critical paths
    T3_PATTERNS=("**/trajectory*" "**/safety_validator*" "**/flight_plan*" "**/migrations/versions/*")
    T2_PATTERNS=("backend/app/**" "frontend/src/**" "backend/tests/**" "docker-compose.yml" "backend/pyproject.toml")
    T1_PATTERNS=("docs/**" "*.md" "**/*.md" "**/*.txt" "LICENSE*" ".gitignore" ".editorconfig")
    DOCS_TRACKED=("README.md" "docs/**")
    DOCS_EXEMPT=("**/*.test.*" "backend/tests/**" "**/__pycache__/**")
    return 0
  fi

  # validate JSON
  if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$CONFIG_FILE" 2>/dev/null; then
    echo "::warning::harness.config.json is not valid JSON — using built-in defaults"
    load_config_defaults
    return 0
  fi

  # extract tier patterns using python (available in this stack)
  local patterns_json
  patterns_json="$(python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
rt = cfg.get('riskTiers', {})
dd = cfg.get('docsDrift', {})
# output: tier3|tier2|tier1|tracked|exempt (pipe-separated, comma within)
t3 = ','.join(rt.get('tier3', {}).get('patterns', []))
t2 = ','.join(rt.get('tier2', {}).get('patterns', []))
t1 = ','.join(rt.get('tier1', {}).get('patterns', []))
td = ','.join(dd.get('trackedDocs', []))
ex = ','.join(dd.get('exemptPatterns', []))
print(f'{t3}|{t2}|{t1}|{td}|{ex}')
" "$CONFIG_FILE" 2>/dev/null || echo "")"

  if [[ -z "$patterns_json" ]]; then
    echo "::warning::Failed to extract config patterns — using built-in defaults"
    load_config_defaults
    return 0
  fi

  IFS='|' read -r t3_raw t2_raw t1_raw td_raw ex_raw <<< "$patterns_json"
  IFS=',' read -ra T3_PATTERNS <<< "$t3_raw"
  IFS=',' read -ra T2_PATTERNS <<< "$t2_raw"
  IFS=',' read -ra T1_PATTERNS <<< "$t1_raw"
  IFS=',' read -ra DOCS_TRACKED <<< "$td_raw"
  IFS=',' read -ra DOCS_EXEMPT <<< "$ex_raw"

  echo "✔ Loaded harness.config.json (${#T3_PATTERNS[@]} tier-3, ${#T2_PATTERNS[@]} tier-2, ${#T1_PATTERNS[@]} tier-1 patterns)"
}

load_config_defaults() {
  T3_PATTERNS=("**/trajectory*" "**/safety_validator*" "**/flight_plan*" "**/migrations/versions/*")
  T2_PATTERNS=("backend/app/**" "frontend/src/**" "backend/tests/**" "docker-compose.yml" "backend/pyproject.toml")
  T1_PATTERNS=("docs/**" "*.md" "**/*.md" "**/*.txt" "LICENSE*" ".gitignore" ".editorconfig")
  DOCS_TRACKED=("README.md" "docs/**")
  DOCS_EXEMPT=("**/*.test.*" "backend/tests/**" "**/__pycache__/**")
}

# ============================================================================
# Step 1: SHA Discipline Check
# Ensures the checked-out commit matches the expected PR head SHA.
# Prevents TOCTOU races where code changes between review and merge.
# ============================================================================
verify_sha() {
  local actual_sha
  actual_sha="$(git rev-parse HEAD)"

  # when running outside CI (local testing), skip SHA enforcement
  if [[ -z "${EXPECTED_SHA:-}" ]]; then
    echo "::notice::EXPECTED_SHA not set — skipping SHA discipline check (local mode)"
    VERIFIED_SHA="$actual_sha"
    return 0
  fi

  if [[ "${actual_sha,,}" != "${EXPECTED_SHA,,}" ]]; then
    echo "::error::SHA discipline violation: checked-out HEAD (${actual_sha}) ≠ expected PR SHA (${EXPECTED_SHA})"
    echo "::error::The branch changed after this workflow was triggered. Re-run the workflow on the latest commit."
    return 1
  fi

  VERIFIED_SHA="$actual_sha"
  echo "✔ SHA verified: ${VERIFIED_SHA:0:12}"
}

# ============================================================================
# Step 2: Changed File Classification
# Gets the PR diff and classifies each file into risk tiers.
# Tier 3 (critical) > Tier 2 (source) > Tier 1 (docs).
# The PR's overall tier is the maximum of all changed files.
# ============================================================================

# glob matching: convert a glob pattern to an extended regex
# supports: ** (any path depth), * (single segment), ? (single char)
glob_to_regex() {
  local pattern="$1"
  local regex=""
  local i=0 len=${#pattern}

  while (( i < len )); do
    local char="${pattern:$i:1}"
    local next="${pattern:$((i+1)):1}"

    if [[ "$char" == "*" && "$next" == "*" ]]; then
      local after="${pattern:$((i+2)):1}"
      if [[ "$after" == "/" ]]; then
        regex+="(.+/)?"
        (( i += 3 ))
      else
        regex+=".*"
        (( i += 2 ))
      fi
    elif [[ "$char" == "*" ]]; then
      regex+="[^/]*"
      (( i++ ))
    elif [[ "$char" == "?" ]]; then
      regex+="[^/]"
      (( i++ ))
    elif [[ "$char" == "." ]]; then
      regex+="\\."
      (( i++ ))
    else
      regex+="$char"
      (( i++ ))
    fi
  done

  echo "^${regex}$"
}

# test if a file matches any pattern in a list
matches_any() {
  local file="$1"
  shift
  local patterns=("$@")

  for pattern in "${patterns[@]}"; do
    [[ -z "$pattern" ]] && continue
    local regex
    regex="$(glob_to_regex "$pattern")"
    if [[ "$file" =~ $regex ]]; then
      return 0
    fi
  done
  return 1
}

# classify a single file into a tier, checking highest tier first
classify_file() {
  local file="$1"

  # tier 3: critical paths (trajectory, safety, flight plan, migrations)
  if matches_any "$file" "${T3_PATTERNS[@]}"; then
    echo 3; return
  fi

  # tier 2: source code, tests, config
  if matches_any "$file" "${T2_PATTERNS[@]}"; then
    echo 2; return
  fi

  # tier 1: documentation, non-code assets
  if matches_any "$file" "${T1_PATTERNS[@]}"; then
    echo 1; return
  fi

  # default: unknown files get medium scrutiny
  echo 2
}

classify_changed_files() {
  local base_ref="${BASE_REF:-main}"

  # ensure we have the base branch ref for computing the merge base
  if ! git rev-parse --verify "origin/${base_ref}" &>/dev/null; then
    git fetch origin "${base_ref}" --depth=1 2>/dev/null || true
  fi

  local merge_base
  merge_base="$(git merge-base "origin/${base_ref}" HEAD 2>/dev/null || echo "")"

  if [[ -z "$merge_base" ]]; then
    echo "::warning::Could not compute merge base against origin/${base_ref}. Defaulting to Tier 3 (safest)."
    MAX_TIER=3
    return
  fi

  local changed_files
  changed_files="$(git diff --name-only "${merge_base}...HEAD" 2>/dev/null || echo "")"

  if [[ -z "$changed_files" ]]; then
    echo "::notice::No changed files detected. Defaulting to Tier 1."
    MAX_TIER=1
    return
  fi

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    local tier
    tier="$(classify_file "$file")"

    case "$tier" in
      1) TIER1_FILES+=("$file") ;;
      2) TIER2_FILES+=("$file") ;;
      3) TIER3_FILES+=("$file") ;;
    esac

    if (( tier > MAX_TIER )); then
      MAX_TIER=$tier
    fi
  done <<< "$changed_files"

  echo "✔ Classified files: ${#TIER1_FILES[@]} tier-1, ${#TIER2_FILES[@]} tier-2, ${#TIER3_FILES[@]} tier-3 → overall Tier ${MAX_TIER}"
}

# ============================================================================
# Step 3: Required Checks Computation
# Maps the determined tier to the CI checks that must pass.
# Higher tiers are strict supersets of lower tiers.
# ============================================================================
compute_required_checks() {
  case "$MAX_TIER" in
    1)
      REQUIRED_CHECKS=("lint" "harness-smoke")
      ;;
    2)
      REQUIRED_CHECKS=("lint" "test" "build" "structural-tests" "harness-smoke")
      ;;
    3)
      REQUIRED_CHECKS=("lint" "test" "build" "structural-tests" "harness-smoke" "manual-approval" "expanded-coverage")
      ;;
    *)
      echo "::warning::Unexpected tier ${MAX_TIER}. Applying Tier 3 checks as safeguard."
      MAX_TIER=3
      REQUIRED_CHECKS=("lint" "test" "build" "structural-tests" "harness-smoke" "manual-approval" "expanded-coverage")
      ;;
  esac

  echo "✔ Required checks (${#REQUIRED_CHECKS[@]}): ${REQUIRED_CHECKS[*]}"
}

# ============================================================================
# Step 4: Docs Drift Assertion
# Detects when source code changes lack corresponding documentation updates.
#   relaxed  → skip entirely
#   standard → emit warning
#   strict   → fail the gate
# ============================================================================
check_docs_drift() {
  if [[ "$STRICTNESS" == "relaxed" ]]; then
    echo "✔ Docs drift check skipped (strictness=relaxed)"
    return 0
  fi

  # only relevant when source files (tier 2+) were changed
  local has_source=false
  if (( ${#TIER2_FILES[@]} > 0 || ${#TIER3_FILES[@]} > 0 )); then
    has_source=true
  fi

  if ! $has_source; then
    echo "✔ No source files changed — docs drift N/A"
    return 0
  fi

  # check if any documentation files were also modified
  local has_docs=false
  for file in "${TIER1_FILES[@]+"${TIER1_FILES[@]}"}"; do
    case "$file" in
      *.md|docs/*) has_docs=true; break ;;
    esac
  done

  if ! $has_docs; then
    DOCS_DRIFT_DETECTED=true
    DOCS_DRIFT_WARNING="Source files changed without documentation updates. Consider updating README.md or relevant docs."

    if [[ "$STRICTNESS" == "strict" ]]; then
      echo "::error::Docs drift: ${DOCS_DRIFT_WARNING}"
      return 1
    else
      echo "::warning::Docs drift: ${DOCS_DRIFT_WARNING}"
    fi
  else
    echo "✔ Documentation updated alongside source changes"
  fi
}

# ============================================================================
# Step 6: Output Results
# Emits structured JSON and sets GitHub Actions step outputs.
# ============================================================================

# build a JSON array from arguments
to_json_array() {
  if (( $# == 0 )); then
    echo "[]"
    return
  fi
  local json="[" sep=""
  for item in "$@"; do
    json+="${sep}\"${item}\""
    sep=","
  done
  echo "${json}]"
}

output_results() {
  local tier_name
  case "$MAX_TIER" in
    1) tier_name="low" ;;
    2) tier_name="medium" ;;
    3) tier_name="high" ;;
    *) tier_name="unknown" ;;
  esac

  local checks_json tier1_json tier2_json tier3_json

  checks_json="$(to_json_array "${REQUIRED_CHECKS[@]}")"

  if (( ${#TIER1_FILES[@]} > 0 )); then
    tier1_json="$(to_json_array "${TIER1_FILES[@]}")"
  else
    tier1_json="[]"
  fi

  if (( ${#TIER2_FILES[@]} > 0 )); then
    tier2_json="$(to_json_array "${TIER2_FILES[@]}")"
  else
    tier2_json="[]"
  fi

  if (( ${#TIER3_FILES[@]} > 0 )); then
    tier3_json="$(to_json_array "${TIER3_FILES[@]}")"
  else
    tier3_json="[]"
  fi

  # escape warning message for JSON
  local escaped_warning="${DOCS_DRIFT_WARNING//\\/\\\\}"
  escaped_warning="${escaped_warning//\"/\\\"}"

  local result
  result=$(cat <<EOF
{
  "sha": "${VERIFIED_SHA}",
  "tier": ${MAX_TIER},
  "tierName": "${tier_name}",
  "requiredChecks": ${checks_json},
  "changedFiles": {
    "tier1": ${tier1_json},
    "tier2": ${tier2_json},
    "tier3": ${tier3_json}
  },
  "docsDrift": {
    "detected": ${DOCS_DRIFT_DETECTED},
    "warning": "${escaped_warning}"
  },
  "reviewStatus": "${REVIEW_RESULT}"
}
EOF
)

  echo ""
  echo "═══════════════════════════════════════════════════"
  echo " Risk Policy Gate Result"
  echo "═══════════════════════════════════════════════════"
  echo "$result"
  echo "═══════════════════════════════════════════════════"

  # set GitHub Actions step outputs for downstream job conditionals
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "sha=${VERIFIED_SHA}"
      echo "tier=${MAX_TIER}"
      echo "tier-name=${tier_name}"
      echo "required-checks=${checks_json}"
      echo "docs-drift=${DOCS_DRIFT_DETECTED}"
      echo "review-status=${REVIEW_RESULT}"
      # multi-line output for the full JSON result
      echo "result<<GATE_EOF"
      echo "$result"
      echo "GATE_EOF"
    } >> "$GITHUB_OUTPUT"
    echo ""
    echo "✔ GitHub Actions outputs written"
  fi
}

# ============================================================================
# Main
# ============================================================================
main() {
  echo "╔═════════════════════════════════════════════════╗"
  echo "║       Risk Policy Gate — Preflight Check        ║"
  echo "╚═════════════════════════════════════════════════╝"
  echo ""

  load_config
  verify_sha
  classify_changed_files
  compute_required_checks
  check_docs_drift
  output_results

  local tier_label
  case $MAX_TIER in
    1) tier_label="low" ;;
    2) tier_label="medium" ;;
    3) tier_label="high" ;;
    *) tier_label="unknown" ;;
  esac

  echo ""
  echo "✔ Gate completed — Tier ${MAX_TIER} (${tier_label}) — ${#REQUIRED_CHECKS[@]} checks required"
}

main "$@"
