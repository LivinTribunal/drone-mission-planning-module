# Documentation Gardening Task

Scan this repository for stale, outdated, or inaccurate documentation and fix it. Be conservative — only fix issues you are confident about. Leave a `<!-- TODO: ... -->` comment for anything ambiguous.

## Documentation Files to Scan

- `README.md` — project overview, harness table, quick start, architecture summary
- `CLAUDE.md` — agent instructions: build commands, code style, architecture, critical paths, security constraints, PR conventions
- `docs/architecture.md` — detailed project structure, component diagram, layer descriptions, data flow, ADRs
- `docs/conventions.md` — coding conventions, naming rules, import order, exports, error handling, formatting, testing, git workflow
- `docs/layers.md` — layer boundary definitions, dependency matrix, enforcement, common violations

## Scanning Checklist

### 1. Broken File References

- Search all five markdown files for backtick-quoted paths (e.g., `` `src/core/detector.ts` ``), markdown links, and inline references to source files.
- Verify each referenced file still exists at that path by reading the filesystem.
- If a file was moved, update the reference to the new location.
- If a file was deleted with no replacement, remove the reference and note the deletion.
- Pay special attention to references in `docs/architecture.md` — the project structure tree and layer descriptions list specific filenames.

### 2. Command Accuracy

Read `package.json` and compare its `scripts` section against documented commands in `CLAUDE.md` and `README.md`:

| Expected Script | Expected Command | Source |
|---|---|---|
| `build` | `tsup` | `CLAUDE.md`, `README.md` |
| `dev` | `tsup --watch` | `CLAUDE.md` |
| `test` | `vitest run` | `CLAUDE.md`, `README.md` |
| `lint` | `eslint src/` | `CLAUDE.md`, `README.md` |
| `typecheck` | `tsc --noEmit` | `CLAUDE.md` |
| `prepare` | `husky` | — |

If any script name, command, or `npm run` invocation in the docs no longer matches `package.json`, update it. Flag commands documented in markdown that have no corresponding `package.json` script.

### 3. Architecture Drift

Compare `docs/architecture.md` against the actual directory structure under `src/`:

- **Expected layers**: `commands/`, `core/`, `harnesses/`, `prompts/`, `providers/`, `ui/`, `utils/`
- **Expected harness modules** (13 files in `src/harnesses/`): `risk-contract`, `claude-md`, `ci-pipeline`, `docs-structure`, `pre-commit-hooks`, `risk-policy-gate`, `review-agent`, `architectural-linters`, `remediation-loop`, `browser-evidence`, `garbage-collection`, `pr-templates`, `incident-harness-loop`
- **Expected prompt files** (matching harness modules, plus `system.ts`, `detect-stack.ts`, `types.ts`)
- **Expected utils files**: `errors.ts`, `fs.ts`, `git.ts`, `harness-config.ts`, `template.ts`

If modules have been added, renamed, or removed since the docs were last written, update the architecture docs accordingly.

### 4. CLAUDE.md Accuracy

Verify each section of `CLAUDE.md` against the actual project state:

1. **Build & Run Commands** — must match `package.json` scripts exactly.
2. **Code Style Rules** — cross-check against `.prettierrc` (single quotes, semicolons, trailing commas, 100-char width, 2-space indent) and `eslint.config.js`.
3. **Architecture Overview** — the directory tree must match actual `src/` contents.
4. **Dependency rule** — the import boundaries table must match `architecturalBoundaries` in `harness.config.json`.
5. **Critical Paths** — the listed files must match the Tier 3 paths implied by `harness.config.json` risk tiers.
6. **Security Constraints** — verify claims are still accurate (e.g., Zod validation in `detector.ts`, tool whitelisting in `claude-runner.ts`).

### 5. Harness Config Consistency

Read `harness.config.json` and verify:

- `commands.test`, `commands.build`, `commands.lint`, `commands.typeCheck` match the actual `package.json` scripts.
- `architecturalBoundaries` layers match the actual `src/` subdirectories.
- `docsDrift.trackedDocs` lists all documentation files that exist.

If `harness.config.json` has drifted, note the discrepancy as a `<!-- TODO: ... -->` comment in `CLAUDE.md` — do not modify `harness.config.json` directly.

### 6. Broken Internal Links

Check all markdown links in both `[text](url)` and `[text][ref]` styles:

- For relative links (e.g., `[architecture](docs/architecture.md)`), verify the target file exists.
- For heading anchors (e.g., `#architecture-overview`), verify the heading exists in the target file.
- For external links, leave them as-is — do not attempt to verify or fix.

### 7. Stale Code Examples

Find code examples in documentation that reference imports, functions, classes, or interfaces:

- Verify referenced symbols still exist in the codebase with the documented signatures.
- Check that import paths use `.js` extensions (ESM requirement).
- Update examples if the API has changed; leave a `<!-- TODO: ... -->` if the replacement is unclear.

### 8. Workflow and Script References

Verify that references to CI workflows and scripts in documentation match actual files:

- **Expected workflows** in `.github/workflows/`: `ci.yml`, `code-review-agent.yml`, `remediation-agent.yml`, `review-agent-rerun.yml`, `risk-policy-gate.yml`, `structural-tests.yml`, `harness-smoke.yml`, `auto-resolve-threads.yml`, `doc-gardening.yml`
- **Expected scripts** in `scripts/`: `lint-architecture.ts`, `lint-architecture-config.json`, `remediation-agent-prompt.md`, `remediation-guard.ts`, `review-agent-utils.ts`, `review-prompt.md`, `risk-policy-gate.sh`, `risk-policy-gate.ts`, `structural-tests.sh`, `doc-gardening-prompt.md`

## Rules

- Only modify documentation files (`*.md`, `*.mdx`, `*.rst`).
- **NEVER** modify source code (`.ts`, `.js`), configuration files (`.json`, `.yml`, `.yaml`), or CI workflows.
- When removing a stale reference, check if there is a replacement to link to.
- Preserve each document's structure, tone, heading hierarchy, and formatting.
- If unsure about a change, leave a `<!-- TODO: verify — [description] -->` comment rather than guessing.
- Add `<!-- Last gardened: YYYY-MM-DD -->` to sections you have verified or updated.
- Do not rewrite paragraphs for style — only fix factual inaccuracies and broken references.
- Do not add new sections or documentation — only maintain what already exists.

## Output

After making changes, provide a plain-text summary listing:

1. **Files modified** and what was changed in each.
2. **Issues found and fixed** (one line per issue).
3. **Issues requiring human decision** (left as `<!-- TODO -->` comments).
4. **Sections verified as up-to-date** (no changes needed).
