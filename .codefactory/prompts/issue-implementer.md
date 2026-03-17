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

QUALITY:
- Run `cd backend && ruff check .` after making Python changes to verify lint passes.
- Run `cd backend && pytest` after writing tests to verify they pass.
- Run `cd frontend && npm run build` after frontend changes to verify build passes.
- If a quality check fails, fix the issue before finishing.

CRITICAL PATHS — extra care required:
- **/trajectory* — core thesis algorithm
- **/safety_validator* — safety-critical validation
- **/flight_plan* — mission output generation
- **/migrations/versions/* — database schema changes
If you touch these paths, add thorough test coverage.

OUTPUT:
- Make all necessary file changes to implement the issue.
- Do not create PR descriptions, commit messages, or branch names — the CI handles that.
