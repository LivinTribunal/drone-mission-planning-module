## Summary
<!-- Brief description of what this PR does and why. Link to the issue if applicable. -->

## Risk Tier
<!-- The risk-policy-gate auto-detects the tier, but classify here for reviewer context. -->
<!-- See harness.config.json for full pattern definitions. -->
- [ ] **Tier 1 (Low)**: Docs, comments, `.md`/`.txt` files, `.gitignore`, `.editorconfig`, `.prettierrc`, `.vscode/`
- [ ] **Tier 2 (Medium)**: Source in `src/ui/`, `src/utils/`, `src/prompts/`, `src/providers/`, `tests/`
- [ ] **Tier 3 (High)**: Entry points, core engine, harness registry, build/CI infra (`src/index.ts`, `src/cli.ts`, `src/commands/`, `src/core/`, `src/harnesses/index.ts`, `src/harnesses/types.ts`, `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `eslint.config.js`)

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
  npm run lint && npm run typecheck && npm test
  ```

## Evidence
<!-- Tier 1: none required. Tier 2: tests-pass, lint-clean, type-check-clean. Tier 3: all of Tier 2 + manual-review. -->

| Check | Result |
|-------|--------|
| `eslint src/` | <!-- PASS / FAIL --> |
| `tsc --noEmit` | <!-- PASS / FAIL --> |
| `vitest run` | <!-- PASS / FAIL --> |
| `tsup` (build) | <!-- PASS / FAIL --> |

## Architectural Compliance
<!-- Confirm layer boundaries are respected (see docs/layers.md). -->
- [ ] No circular imports introduced
- [ ] Import rules followed: `utils` imports nothing; `core` imports only `utils`; etc.
- [ ] No imports from `commands` or `harnesses` inside `core`

## Review Checklist
- [ ] Code follows project conventions (`docs/conventions.md`, `CLAUDE.md`)
- [ ] ESM imports use `.js` extensions for local files
- [ ] `import type` used for type-only imports
- [ ] No secrets, API keys, or `.env` files committed
- [ ] No ESLint rules or TypeScript strict mode disabled
- [ ] Documentation updated if public API changed
- [ ] Risk tier accurately reflects scope of changes
