---
name: chrome-devtools
description: Use Chrome DevTools MCP server for browser debugging. Always activate when triaging or planning UI/frontend issues, checking console logs, network requests, visual bugs, or any browser-related problem. Do not skip browser inspection for frontend tasks.
---

# Chrome DevTools MCP — Always Inspect the Browser

When triaging or planning any issue involving UI, frontend, visual bugs, browser behavior, or console errors, you **MUST** use the Chrome DevTools MCP server to inspect the actual browser state before drawing conclusions.

**Never file a triage report or write a plan for a UI/frontend issue without first checking the browser console.**

## Setup

Chrome DevTools MCP connects to your running Chrome or Edge browser via the **Claude in Chrome** browser extension.

- **Enable Chrome integration**: run `claude --chrome` or type `/chrome` inside a session.
- **Check connection status**: run `/chrome` — it shows status and lets you reconnect.
- **MCP server**: `chrome-devtools-mcp` (installed via `npx -y chrome-devtools-mcp@latest` or through the plugin marketplace).
- **Official docs**: `https://code.claude.com/docs/en/chrome.md`
- **MCP server repo**: `https://github.com/ChromeDevTools/chrome-devtools-mcp`

## Required Workflow for UI/Frontend Issues

Follow these steps **in order** for any browser-facing problem:

```
1. navigate_page   → go to the relevant URL (localhost:PORT or staging URL)
2. list_console_messages  → ALWAYS do this immediately after navigation
3. take_screenshot        → document the visual state
4. list_network_requests  → check for failed API calls (4xx, 5xx, CORS)
5. evaluate_script        → inspect live DOM/JS state if needed
```

## All Available Tools (26 total)

### Debugging — Start Here

| Tool                    | What it does                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `list_console_messages` | **Use first.** Lists all console messages: errors, warnings, logs. Errors on page load appear here. |
| `get_console_message`   | Get a specific console message by index for detailed inspection.                                    |
| `evaluate_script`       | Run any JavaScript in the live page context — inspect variables, call functions, query DOM.         |
| `take_screenshot`       | Capture the current visual state of the page. Use to document bugs and verify fixes.                |
| `take_snapshot`         | Record the full DOM structure and state for deep inspection.                                        |

### Navigation

| Tool            | What it does                                                              |
| --------------- | ------------------------------------------------------------------------- |
| `navigate_page` | Go to a URL. Always call `list_console_messages` right after.             |
| `new_page`      | Open a new browser tab.                                                   |
| `list_pages`    | See all open tabs — useful in multi-tab workflows.                        |
| `select_page`   | Switch focus to a specific tab.                                           |
| `wait_for`      | Wait for a condition: element visible, network idle, text to appear, etc. |
| `close_page`    | Close a tab when done.                                                    |

### Network Inspection

| Tool                    | What it does                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `list_network_requests` | View all HTTP requests and responses — check for failures, CORS issues, slow calls. |
| `get_network_request`   | Get full details (headers, body, timing) for a specific request.                    |

### Interaction (for bug reproduction)

| Tool            | What it does                                               |
| --------------- | ---------------------------------------------------------- |
| `click`         | Click an element by selector or coordinates.               |
| `fill`          | Type text into an input field.                             |
| `fill_form`     | Populate multiple form fields at once.                     |
| `hover`         | Hover over an element to trigger hover states or tooltips. |
| `press_key`     | Simulate keyboard input (Enter, Tab, Escape, etc.).        |
| `drag`          | Drag an element to a new position.                         |
| `handle_dialog` | Respond to browser alert/confirm/prompt dialogs.           |
| `upload_file`   | Submit a file through a file input element.                |

### Performance

| Tool                          | What it does                                                            |
| ----------------------------- | ----------------------------------------------------------------------- |
| `performance_start_trace`     | Begin recording performance metrics.                                    |
| `performance_stop_trace`      | Stop recording and get raw trace data.                                  |
| `performance_analyze_insight` | Extract Core Web Vitals, bottlenecks, and optimization recommendations. |

### Emulation

| Tool          | What it does                                                                     |
| ------------- | -------------------------------------------------------------------------------- |
| `emulate`     | Simulate different devices (mobile, tablet) or network conditions (3G, offline). |
| `resize_page` | Change the viewport size for responsive testing.                                 |

## Example Workflows

### Triaging a Console Error

```
1. navigate_page({ url: "http://localhost:3000/broken-page" })
2. list_console_messages()          ← copy errors into your triage report
3. take_screenshot()                ← attach as visual evidence
4. list_network_requests()          ← check if any API call failed
5. evaluate_script({
     expression: "window.__lastError || document.querySelector('.error')?.textContent"
   })                               ← inspect live state
```

### Reproducing a Form Validation Bug

```
1. navigate_page({ url: "http://localhost:3000/login" })
2. list_console_messages()          ← baseline: any errors on load?
3. fill({ selector: "#email", value: "bad@" })
4. fill({ selector: "#password", value: "x" })
5. click({ selector: "[type=submit]" })
6. wait_for({ condition: "network-idle" })
7. list_console_messages()          ← what happened after submit?
8. take_screenshot()                ← document the result
```

### Investigating a Slow Page

```
1. navigate_page({ url: "http://localhost:3000/dashboard" })
2. performance_start_trace()
3. wait_for({ condition: "network-idle" })
4. performance_stop_trace()
5. performance_analyze_insight()    ← get LCP, INP, CLS, bottlenecks
6. list_network_requests()          ← find slow API calls
```

### Mobile/Responsive Testing

```
1. emulate({ device: "iPhone 14" })
2. navigate_page({ url: "http://localhost:3000" })
3. take_screenshot()                ← check mobile layout
4. list_console_messages()          ← mobile-specific errors?
```

## What to Include in Your Triage/Plan Output

When you use Chrome DevTools for a triage or planning task, include in your output:

- **Console errors**: paste the exact error messages from `list_console_messages`
- **Screenshot**: reference the captured screenshot as visual evidence
- **Network failures**: list any failed requests (status, URL, error)
- **Reproduction steps**: the exact sequence of browser interactions that triggers the bug
- **Browser state**: any relevant DOM or JS state from `evaluate_script`

## Important Notes

- **Always run `list_console_messages` immediately after `navigate_page`** — many errors only appear on page load.
- If Chrome is not connected, run `/chrome` to reconnect or start with `claude --chrome`.
- Chrome DevTools MCP works with Google Chrome and Microsoft Edge (not Brave, Arc, or other Chromium variants).
- WSL (Windows Subsystem for Linux) is not supported for Chrome integration.
- For more detail on the chrome integration, see: `https://code.claude.com/docs/en/chrome.md`
