---
name: check-docs
description: Read project docs, specs, and agent prompts before implementing, reviewing, or planning. Ensures alignment with domain model, conventions, design system, and automation workflows.
---

# Check Documentation First

**Before starting ANY implementation, review, or planning task, read the relevant documentation.** This prevents implementing something that contradicts the domain model, duplicates existing patterns, or breaks automation workflows.

## Step 1: Read CLAUDE.md

Always start here. It contains build commands, code style rules, architecture overview, dependency rules, DDD patterns, risk tiers, branching strategy, and security constraints.

## Step 2: Read the Relevant Spec Docs

Pick the docs that match your task — you don't need all of them every time.

| File | When to read | What it contains |
|------|-------------|-----------------|
| `docs/specs/SPEC.md` | **Any feature work** | Complete domain model (19 tables), all enums, trajectory formulas, mission state machine, page wireframe summaries |
| `docs/specs/WIREFRAME.md` | **Any frontend page** | Every field, interaction, and edge case for each UI page |
| `docs/specs/DESIGN-SYSTEM.md` | **Any UI component** | CSS variables (`--tv-*`), color tokens, spacing, typography, component patterns |
| `docs/specs/CHAPTER3-SYSTEM-DESIGN.md` | **Architecture questions** | Full system design chapter — the authoritative design reference |
| `docs/specs/TRAJECTORY-CONTEXT.md` | **Trajectory/flight work** | Trajectory generation context and formulas |
| `docs/conventions.md` | **Code style questions** | Coding standards, git workflow, quality gates |
| `harness.config.json` | **Risk assessment** | Risk tier definitions and architectural boundaries |

**Rule of thumb:**
- Backend feature → read `SPEC.md` (domain model + enums)
- Frontend page → read `SPEC.md` + `WIREFRAME.md` + `DESIGN-SYSTEM.md`
- Trajectory/flight plan → read `SPEC.md` + `TRAJECTORY-CONTEXT.md`
- Architecture decision → read `CHAPTER3-SYSTEM-DESIGN.md`

## Step 3: Read Agent Prompts (for automation and review tasks)

The `.codefactory/prompts/` folder defines how the CodeFactory automation pipeline works. Read the relevant prompt before working on or modifying any automation workflow.

| File | When to read | What it defines |
|------|-------------|----------------|
| `.codefactory/prompts/agent-system.md` | **Any agent work** | Identity rules, OPSEC constraints, commit style for all agents |
| `.codefactory/prompts/issue-triage.md` | **Triage workflow** | How issues get evaluated for actionability and labeled |
| `.codefactory/prompts/issue-planner.md` | **Planning workflow** | How implementation plans are structured and posted |
| `.codefactory/prompts/issue-implementer.md` | **Implementation workflow** | How the coding agent creates branches, writes code, opens PRs |
| `.codefactory/prompts/review-agent.md` | **Review workflow** | How PRs get auto-reviewed (APPROVE / REQUEST_CHANGES / ESCALATE) |

**When to check these:**
- Creating or modifying a GitHub issue → read `issue-triage.md`
- Writing or reviewing an implementation plan → read `issue-planner.md`
- Implementing from a plan → read `issue-implementer.md`
- Reviewing a PR or understanding review feedback → read `review-agent.md`
- Changing any agent behavior → read `agent-system.md` first, then the specific prompt

## Step 4: Check Claude Code Docs (for tooling and extension work)

Only needed when working on Claude Code configuration, skills, hooks, MCP, or CI/CD integration — not for regular feature work.

The documentation index is at `https://code.claude.com/docs/llms.txt`. Fetch it to discover available pages. Base URL: `https://code.claude.com/docs/en/`.

| Task type | Docs to check |
|-----------|--------------|
| Skills or slash commands | `skills.md` |
| Subagents | `sub-agents.md` |
| Hooks (tool event automation) | `hooks.md`, `hooks-guide.md` |
| MCP integration | `mcp.md` |
| Permissions | `permissions.md` |
| Memory and CLAUDE.md | `memory.md` |
| CI/CD | `github-actions.md` or `gitlab-ci-cd.md` |
| Headless / Agent SDK | `headless.md` |

## Step 5: Apply What You Found

1. **Identify the risk tier** — T3 paths (trajectory, safety_validator, flight_plan, migrations) require extra tests and human review.
2. **Check if your task overlaps** with documented patterns or existing implementations.
3. **Follow DDD rules** — business logic on models, services handle DB access only.
4. **Use the design system** — every component must use `--tv-*` CSS variables.
5. **Proceed with implementation/review/planning** using the documented patterns.
