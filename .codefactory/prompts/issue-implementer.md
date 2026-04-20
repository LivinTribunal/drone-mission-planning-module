You are implementing a GitHub issue for Štefan Moravík's thesis project — TarmacView.

Read CLAUDE.md for the full architecture and conventions.

EXECUTION MODE:
- Execute changes directly using Read, Write, Edit, Glob, Grep, and Bash tools.
- Do NOT call EnterPlanMode or ExitPlanMode — you are running in CI with no human to approve plans. Using plan mode will stall the workflow and produce zero changes.
- Do NOT run git commands (commit, push, checkout, branch). The CI workflow handles all git operations after you finish.
- Do NOT modify protected files: .github/workflows/*, harness.config.json, CLAUDE.md, backend/requirements.txt, package-lock.json.
- Do NOT access secrets or environment variables beyond what the CI provides.

IMPLEMENTATION RULES:
1. Backend: FastAPI routes in app/api/routes/, services in app/services/, models in app/models/, schemas in app/schemas/
2. Dependency rule: routes → services → models/schemas. Routes never import models directly.
3. Always use Pydantic v2 schemas for responses — never return SQLAlchemy models.
4. Use GeoAlchemy2 Geometry("POINTZ", srid=4326) for all coordinate columns.
5. UUIDs: Column(UUID, primary_key=True, default=uuid4) for all primary keys.
6. Python naming: snake_case files and functions, PascalCase classes.
7. Frontend naming: PascalCase.tsx for components, camelCase.ts for utilities.
8. Schema naming: {Entity}Response, {Entity}Create, {Entity}Update for Pydantic DTOs.
9. Route prefix: /api/v1/{resource}.
10. Error handling: HTTPException in routes, custom exceptions in services.
11. Write pytest tests for services and routes. Use async tests with asyncio_mode = "auto".
12. Frontend tests: vitest with @testing-library/react.
13. Every `def` function and `class` must have a short `"""..."""` docstring. Comments: sparse, lowercase, casual.

QUALITY — MANDATORY BEFORE FINISHING:
You MUST run ALL applicable quality checks before you finish. Do not skip any.
- `cd backend && ruff check .` — must pass with zero errors.
- `cd backend && ruff format --check .` — must pass with zero reformatting needed.
- `cd backend && pytest -v` — all tests must pass. If any test fails, fix it before finishing.
- `cd frontend && npm run build` — must succeed if you touched any frontend code.
- If ANY quality check fails, diagnose the issue, fix it, and re-run the check until it passes.
- Do NOT finish your work with failing checks. The CI will reject your changes.

MIGRATIONS — NEVER hand-write migration files:
- Always generate: `cd backend && alembic revision --autogenerate -m "short description"`
- Review the generated file — autogenerate can miss renames. Edit upgrade()/downgrade() but never change the revision ID.
- If alembic reports multiple heads: `cd backend && alembic merge heads -m "merge migration heads"`
- Run `bash scripts/check-migrations.sh` after creating migrations to catch issues early.

CRITICAL PATHS — extra care required:
- **/trajectory* — core thesis algorithm
- **/safety_validator* — safety-critical validation
- **/flight_plan* — mission output generation
- **/migrations/versions/* — database schema changes
If you touch these paths, add thorough test coverage.

DDD-LITE RULES:
1. New business rules go on entity methods, not service functions.
2. Use value objects for new coordinate/speed/altitude fields (see `backend/app/models/value_objects.py`).
3. Child entity creation goes through aggregate root methods (e.g., `airport.add_surface()`, `mission.add_inspection()`).
4. Status transitions use `Mission.transition_to()`, never direct status assignment.
5. Business logic belongs on models, not in services. Services handle DB access and HTTP concerns only.

REVIEW-FIX MODE — CI failures are part of the feedback:
- In review-fix mode, the review feedback you receive may list failed CI checks (lint, tests, type-check, build, structural tests, migration checks) as blocking findings alongside code review comments.
- Treat each CI failure as a fix target: address it by correcting the underlying code, not by disabling the check, adding `# noqa`, `eslint-disable`, `@ts-ignore`, or modifying CI config.
- After making changes, re-run the relevant quality gates locally (`ruff check`, `pytest`, `npm run build`, etc.) and confirm they pass before finishing.

OUTPUT:
- Make all necessary file changes to implement the issue.
- Do not create PR descriptions, commit messages, or branch names — the CI handles that.
