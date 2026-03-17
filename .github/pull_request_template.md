## Summary
<!-- 1-2 sentences. Link the issue: Closes #N -->

## Risk Tier
<!-- The risk-policy-gate auto-detects the tier, but classify here for reviewer context. -->
- [ ] **Tier 1 (Low)**: Docs, comments, `*.md`, `*.txt`, `.gitignore`
- [ ] **Tier 2 (Medium)**: Source in `backend/app/**`, `frontend/src/**`, `backend/tests/**`, config files
- [ ] **Tier 3 (High)**: Critical paths (`**/trajectory*`, `**/safety_validator*`, `**/flight_plan*`, `**/migrations/versions/*`)

## Changes

### Added
-

### Changed
-

### Removed
-

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] All checks pass locally:
  ```
  cd backend && ruff check . && ruff format --check . && pytest
  cd frontend && npm run lint && npx vitest run && npm run build
  ```

## Evidence
<!-- T1: none. T2: tests-pass, lint-clean. T3: all T2 + manual-review. -->

| Check | Result |
|-------|--------|
| `ruff check .` | <!-- PASS / FAIL --> |
| `ruff format --check .` | <!-- PASS / FAIL --> |
| `pytest` | <!-- PASS / FAIL --> |
| `npm run lint` | <!-- PASS / FAIL --> |
| `npm run build` | <!-- PASS / FAIL --> |

## Architectural Compliance
<!-- Confirm layer boundaries are respected (see docs/layers.md). -->
- [ ] No circular imports introduced
- [ ] Dependency rule: routes -> services -> models/schemas
- [ ] Routes never import models directly
- [ ] No business logic in route handlers

## Review Checklist
- [ ] Code follows project conventions (`docs/conventions.md`, `CLAUDE.md`)
- [ ] Every `def` and `class` has a docstring
- [ ] Pydantic schemas used for all API responses
- [ ] No secrets, API keys, or `.env` files committed
- [ ] No Ruff rules or TypeScript strict mode disabled
- [ ] Risk tier accurately reflects scope of changes
