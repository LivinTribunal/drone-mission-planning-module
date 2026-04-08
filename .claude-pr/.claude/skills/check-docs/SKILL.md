---
name: check-docs
description: Always check project docs and Claude Code documentation before implementing, reviewing, or planning. Load at the start of every coding task to find the right docs section for your work type.
---

# Check Documentation First

**Before starting ANY implementation, review, or planning task, you MUST check the relevant documentation.** This keeps you aligned with current APIs, patterns, and conventions — and prevents you from implementing something that already exists or contradicts established architecture.

## Step 1: Check the Project Docs

Start with the local project documentation:

| File                   | Contents                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`            | **Read this first.** Critical conventions, build commands, code style, architecture overview, and security constraints. |
| `docs/architecture.md` | System architecture, component diagrams, and data flow.                                                                 |
| `docs/conventions.md`  | Code conventions, naming rules, and patterns to follow.                                                                 |
| `docs/layers.md`       | Architectural layers and dependency rules (what can import what).                                                       |
| `docs/harness-gaps.md` | Known gaps and planned improvements to the harness system.                                                              |
| `harness.config.json`  | Risk tiers, architectural boundaries, and harness module registry.                                                      |

## Step 2: Find the Right Claude Code Docs Section

The Claude Code documentation index is at:

```
https://code.claude.com/docs/llms.txt
```

Fetch this first to discover all available pages, then navigate to the section most relevant to your task. The base URL for all docs is `https://code.claude.com/docs/en/`.

### If You Are Implementing

| Task type                             | Docs to check                                              |
| ------------------------------------- | ---------------------------------------------------------- |
| Building a new feature                | `common-workflows.md` — patterns for everyday coding tasks |
| Working with skills or slash commands | `skills.md` — full skills reference                        |
| Delegating to subagents               | `sub-agents.md` — how to create and use subagents          |
| Automating around tool events         | `hooks.md` and `hooks-guide.md`                            |
| Connecting to external tools          | `mcp.md` — Model Context Protocol integration              |
| Running Claude programmatically       | `headless.md` — Agent SDK usage                            |
| Controlling permissions               | `permissions.md` — tool and skill access control           |
| Managing memory and CLAUDE.md         | `memory.md` — persistent context across sessions           |

### If You Are Reviewing

| Task type                  | Docs to check                                                  |
| -------------------------- | -------------------------------------------------------------- |
| Security review            | `security.md` — safeguards and best practices                  |
| Code quality review        | `best-practices.md` — recommended patterns                     |
| Understanding agentic loop | `how-claude-code-works.md` — built-in tools and agent behavior |
| Checking permissions model | `permissions.md`                                               |

### If You Are Planning or Triaging

| Task type                              | Docs to check                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Choosing the right extension mechanism | `features-overview.md` — when to use CLAUDE.md vs Skills vs Subagents vs Hooks vs MCP vs Plugins |
| Coordinating multiple agents           | `agent-teams.md`                                                                                 |
| CI/CD integration                      | `github-actions.md` or `gitlab-ci-cd.md`                                                         |
| Plugin architecture                    | `plugins.md` and `plugins-reference.md`                                                          |
| Understanding settings                 | `settings.md`                                                                                    |

## Step 3: Apply What You Found

After reading the relevant docs:

1. **Note any API or pattern changes** since you last worked in this area.
2. **Check if your task is already covered** by a documented workflow or built-in feature.
3. **Identify the architectural layer** your change belongs to (see `docs/layers.md` and `harness.config.json`).
4. **Verify risk tier** — Tier 3 (critical paths) requires extra test coverage and human review.
5. **Proceed with implementation/review/planning** using the documented patterns.

## Quick Reference: Doc Structure

```
code.claude.com/docs/en/
├── Getting started
│   ├── quickstart.md          — Install and first steps
│   ├── overview.md            — What Claude Code is
│   └── setup.md               — Installation and auth
├── Using Claude Code
│   ├── common-workflows.md    — Everyday coding patterns
│   ├── best-practices.md      — Tips for quality output
│   ├── interactive-mode.md    — Keyboard shortcuts and modes
│   └── how-claude-code-works.md — Agentic loop internals
├── Extensions
│   ├── skills.md              — Custom slash commands and skills
│   ├── sub-agents.md          — Specialized subagents
│   ├── hooks.md               — Lifecycle hook events
│   ├── mcp.md                 — Model Context Protocol
│   ├── plugins.md             — Packaging extensions
│   └── features-overview.md  — When to use each mechanism
├── Configuration
│   ├── settings.md            — Global and project settings
│   ├── permissions.md         — Access control
│   ├── memory.md              — CLAUDE.md and persistent context
│   └── model-config.md        — Model selection
├── CI/CD Integration
│   ├── github-actions.md
│   ├── gitlab-ci-cd.md
│   └── headless.md            — Agent SDK (programmatic use)
├── Browser
│   └── chrome.md              — Chrome DevTools integration
└── Reference
    ├── cli-reference.md
    ├── security.md
    └── troubleshooting.md
```

> **Tip:** If unsure which doc to check, fetch `https://code.claude.com/docs/llms.txt` and scan the descriptions — each page has a one-line summary.
