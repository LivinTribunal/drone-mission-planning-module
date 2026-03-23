# Documentation Gardening Task

Scan this repository for stale, outdated, or inaccurate documentation and fix it. Be conservative — only fix issues you are confident about. Leave a `<!-- TODO: ... -->` comment for anything ambiguous.

## Documentation Files to Scan

- `README.md` — project overview, quick start, architecture summary
- `CLAUDE.md` — agent instructions: build commands, code style, architecture, critical paths, security constraints, PR conventions
- `docs/conventions.md` — coding conventions, naming rules, import order, error handling, formatting, testing, git workflow
- `docs/specs/SPEC.md` — domain model, enum values, trajectory formulas, UI page specs, status rules
- `docs/specs/DESIGN-SYSTEM.md` — visual design system, color palette, typography, spacing, component patterns

## Scanning Checklist

### 1. Broken File References

- Search all markdown files for backtick-quoted paths (e.g., `` `backend/app/services/` ``), markdown links, and inline references to source files.
- Verify each referenced file still exists at that path by reading the filesystem.
- If a file was moved, update the reference to the new location.
- If a file was deleted with no replacement, remove the reference and note the deletion.
- Pay special attention to directory tree listings in `CLAUDE.md` — the project structure section lists specific directories and files.

### 2. Command Accuracy

Read `backend/pyproject.toml`, `backend/requirements.txt`, and `frontend/package.json` and compare against documented commands in `CLAUDE.md` and `README.md`:

- Backend commands: `pip install`, `uvicorn`, `pytest`, `ruff check`, `ruff format`
- Frontend commands: `npm install`, `npm run dev`, `npm run build`, `npm run lint`, `npx vitest run`
- Database: `docker compose up -d`

If any command in the docs no longer matches the actual tooling, update it.

### 3. Architecture Drift

Compare `CLAUDE.md` project structure section against the actual directory structure:

- **Backend**: `backend/app/api/routes/`, `backend/app/core/`, `backend/app/models/`, `backend/app/schemas/`, `backend/app/services/`
- **Frontend**: `frontend/src/pages/`, `frontend/src/components/`, `frontend/src/contexts/`, `frontend/src/api/`, `frontend/src/i18n/`, `frontend/src/types/`
- **Frontend components**: `common/`, `mission/`, `map/`, `Layout/`, `Auth/`
- **Map layers**: `frontend/src/components/map/layers/` and `frontend/src/components/map/overlays/`

If directories or key files have been added, renamed, or removed since the docs were last written, update the docs accordingly.

### 4. CLAUDE.md Accuracy

Verify each section of `CLAUDE.md` against the actual project state:

1. **Build & Run Commands** — must match actual tooling.
2. **Code Style Rules** — cross-check against `backend/pyproject.toml` (ruff config) and `frontend/eslint.config.js`.
3. **Project Structure** — the directory tree must match actual contents.
4. **Critical Paths** — the listed paths must match the Tier 3 patterns in `harness.config.json`.
5. **DDD-Lite Patterns** — verify referenced model methods and value objects still exist.

### 5. Broken Internal Links

Check all markdown links in both `[text](url)` and `[text][ref]` styles:

- For relative links (e.g., `[architecture](docs/architecture.md)`), verify the target file exists.
- For heading anchors (e.g., `#architecture-overview`), verify the heading exists in the target file.
- For external links, leave them as-is — do not attempt to verify or fix.

### 6. Workflow and Script References

Verify that references to CI workflows and scripts in documentation match actual files:

- Check `.github/workflows/` for actual workflow files.
- Check `scripts/` for actual script files.
- Check `.codefactory/prompts/` for actual prompt files.

## Rules

- Only modify documentation files (`*.md`, `*.mdx`, `*.rst`).
- **NEVER** modify source code (`.py`, `.ts`, `.tsx`, `.js`), configuration files (`.json`, `.yml`, `.yaml`, `.toml`), or CI workflows.
- When removing a stale reference, check if there is a replacement to link to.
- Preserve each document's structure, tone, heading hierarchy, and formatting.
- If unsure about a change, leave a `<!-- TODO: verify — [description] -->` comment rather than guessing.
- Do not rewrite paragraphs for style — only fix factual inaccuracies and broken references.
- Do not add new sections or documentation — only maintain what already exists.

## Output

After making changes, provide a plain-text summary listing:

1. **Files modified** and what was changed in each.
2. **Issues found and fixed** (one line per issue).
3. **Issues requiring human decision** (left as `<!-- TODO -->` comments).
4. **Sections verified as up-to-date** (no changes needed).
