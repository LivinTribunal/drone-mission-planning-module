## Agent-Generated PR

**Agent**: <!-- agent name and version (e.g., Claude Code v1.0, remediation-bot) -->
**Trigger**: <!-- what triggered this PR: review remediation, feature request, scheduled task -->
**Head SHA**: `<!-- exact commit SHA this PR was generated at -->`

## Summary
<!-- Auto-generated summary describing all changes. -->

## Risk Assessment

- **Detected Risk Tier**: <!-- auto-populated by risk-policy-gate -->
- **Critical paths touched**:
  <!-- List any files matching Tier 3 patterns from harness.config.json:
       src/index.ts, src/cli.ts, src/commands/**, src/core/**,
       src/harnesses/index.ts, src/harnesses/types.ts,
       package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, eslint.config.js -->
  -
- **Confidence level**: <!-- high / medium / low -->

## Changes Made
<!-- Complete list of every file modified. -->

| File | Change Type | Description |
|------|-------------|-------------|
| | added / modified / deleted | |

## Validation Results

| Check | Status | Command |
|-------|--------|---------|
| Lint | <!-- PASS / FAIL --> | `eslint src/` |
| Type Check | <!-- PASS / FAIL --> | `tsc --noEmit` |
| Tests | <!-- PASS / FAIL --> | `vitest run` |
| Build | <!-- PASS / FAIL --> | `tsup` |

## Architectural Compliance
<!-- Layer boundary check results (see docs/layers.md, harness.config.json → architecturalBoundaries). -->
- [ ] No circular imports
- [ ] Import rules respected
- [ ] No protected files modified (`.github/workflows/`, `harness.config.json`, `CLAUDE.md`, lockfiles)

## Review Agent Status
- [ ] Review agent has analyzed this PR
- [ ] No unresolved blocking findings
- [ ] Review SHA matches current HEAD (`<!-- SHA -->`)
- **Verdict**: <!-- APPROVE / REQUEST_CHANGES / PENDING -->

## Human Review Required
<!-- Tier 3 changes require manual approval via the tier3-approval environment gate. -->
- [ ] Required — Tier 3 (high-risk) changes detected
- [ ] Optional but recommended — Tier 2 changes

## Remediation History
<!-- Only if this PR was created or updated by the remediation agent. Remove this section otherwise. -->
- **Original PR**: #<!-- number -->
- **Remediation attempt**: <!-- 1 / 2 / 3 (max 3 per harness.config.json) -->
- **Findings fixed**: <!-- count -->
- **Findings skipped**: <!-- count, with brief reasons -->
- **Validation after fix**: <!-- all passed / partial — specify which failed -->
