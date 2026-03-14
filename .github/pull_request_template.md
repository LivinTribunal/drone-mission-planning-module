## Summary
<!-- Brief description of what this PR does and why. Link to the issue if applicable. -->

Closes #

## Risk Tier
<!-- The risk-policy-gate auto-detects the tier, but classify here for reviewer context. -->
<!-- See risk tier definitions below. -->
- [ ] **Tier 1 (Low)**: Docs, comments, `*.md`, `.editorconfig`, `.gitignore`, `.prettierrc`
- [ ] **Tier 2 (Medium)**: Source in `backend/app/**`, `frontend/src/**`, `tests/**`, config files
- [ ] **Tier 3 (High)**: Critical paths — `**/trajectory*`, `**/safety_validator*`, `**/flight_plan*`, `**/migrations/versions/*`, CI/infra

## Changes
<!-- Group modified files by logical concern. -->

### Added
-

### Changed
-

### Removed
-

## Testing
<!-- How were these changes validated? -->
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] All checks pass locally:
  ```
  cd backend && ruff check . && ruff format --check . && pytest
  cd frontend && npm run lint && npx vitest run && npm run build
  ```

## Evidence
<!-- Tier 1: none required. Tier 2: tests-pass, lint-clean. Tier 3: all of Tier 2 + browser evidence + manual-review. -->

| Check | Result |
|-------|--------|
| `ruff check .` | <!-- PASS / FAIL --> |
| `ruff format --check .` | <!-- PASS / FAIL --> |
| `pytest` | <!-- PASS / FAIL --> |
| `npm run lint` | <!-- PASS / FAIL --> |
| `npx vitest run` | <!-- PASS / FAIL --> |
| `npm run build` | <!-- PASS / FAIL --> |

## Architectural Compliance
<!-- Confirm layer boundaries are respected (routes → services → models/schemas). -->
- [ ] No circular imports introduced
- [ ] Dependency rule followed: routes → services → models/schemas (routes never import models directly)
- [ ] Pydantic schemas use `{Entity}Response`, `{Entity}Create`, `{Entity}Update` naming
- [ ] Routes follow `/api/v1/{resource}` pattern
- [ ] TS types in `frontend/src/types/` match backend Pydantic schemas

## Review Checklist
- [ ] Code follows project conventions
- [ ] Python: `snake_case` files/functions, `PascalCase` classes, 100-char line limit
- [ ] Frontend: `PascalCase.tsx` components, `camelCase.ts` utilities
- [ ] No secrets, API keys, `.env` files, or credentials committed
- [ ] No Ruff rules, ESLint rules, or TypeScript strict mode disabled
- [ ] No raw SQL — SQLAlchemy ORM only with parameterized queries
- [ ] Alembic migration included if database schema changed
- [ ] Documentation updated if public API changed
- [ ] Risk tier accurately reflects scope of changes
