#!/usr/bin/env npx tsx
// ============================================================================
// Browser Evidence Capture — screenshots and console evidence for UI changes
//
// Captures full-page screenshots and console output for each UI flow.
// Designed for two execution modes:
//   1. Local: manual browser testing with MCP puppeteer tools
//   2. CI: this script uses Playwright Node API (headless)
//
// Usage:
//   npx tsx scripts/harness-ui-capture-browser-evidence.ts [options]
//
// Options:
//   --flows <names>   Comma-separated flow names or "all" (default: "all")
//   --base-url <url>  Base URL of the running app (default: http://localhost:5173)
//   --headed          Run browser in headed mode for local debugging
//
// Environment variables:
//   TEST_USER_EMAIL     — test account email (default: test@tarmacview.local)
//   TEST_USER_PASSWORD  — test account password
//
// Exit codes:
//   0  All flows captured successfully
//   1  One or more captures failed
//   2  Configuration or runtime error
// ============================================================================

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join as pathJoin, resolve } from 'node:path';

// --- Types ---

interface FlowDefinition {
  name: string;
  path: string;
  requiresAuth: boolean;
  description: string;
}

interface FlowResult {
  name: string;
  entrypoint: string;
  screenshot: string;
  consoleErrors: string[];
  finalUrl: string;
  accountIdentity: string | null;
  durationMs: number;
}

interface EvidenceManifest {
  capturedAt: string;
  headSha: string;
  captureMode: 'mcp' | 'puppeteer' | 'playwright';
  flows: FlowResult[];
}

// --- Constants ---

const EVIDENCE_DIR = resolve('.harness/evidence');
const SCREENSHOTS_DIR = pathJoin(EVIDENCE_DIR, 'screenshots');
const MANIFEST_PATH = pathJoin(EVIDENCE_DIR, 'manifest.json');

/** UI flows to capture — extend as the app grows */
const FLOW_DEFINITIONS: FlowDefinition[] = [
  {
    name: 'login',
    path: '/',
    requiresAuth: false,
    description: 'Login / landing page',
  },
  {
    name: 'operator-center',
    path: '/operator-center',
    requiresAuth: true,
    description: 'Operator center — mission planning dashboard',
  },
  {
    name: 'coordinator-center',
    path: '/coordinator-center',
    requiresAuth: true,
    description: 'Coordinator center — airport configuration dashboard',
  },
];

/** Maps changed file patterns to required evidence flows */
const FILE_FLOW_MAP: Array<{ pattern: RegExp; flows: string[] }> = [
  { pattern: /frontend\/src\/pages\/operator-center/, flows: ['operator-center'] },
  { pattern: /frontend\/src\/pages\/coordinator-center/, flows: ['coordinator-center'] },
  { pattern: /frontend\/src\/App\.tsx/, flows: ['login', 'operator-center', 'coordinator-center'] },
  { pattern: /frontend\/src\/api\//, flows: ['login', 'operator-center', 'coordinator-center'] },
  { pattern: /frontend\/src\/components\//, flows: ['login', 'operator-center', 'coordinator-center'] },
  { pattern: /frontend\/src\/.*\.tsx?$/, flows: ['login'] },
];

// --- CLI ---

interface CliArgs {
  flows: string[];
  baseUrl: string;
  headed: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let flowsRaw = 'all';
  let baseUrl = 'http://localhost:5173';
  let headed = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--flows' && args[i + 1]) flowsRaw = args[++i];
    if (args[i] === '--base-url' && args[i + 1]) baseUrl = args[++i];
    if (args[i] === '--headed') headed = true;
  }

  const flows = flowsRaw === 'all'
    ? FLOW_DEFINITIONS.map((f) => f.name)
    : flowsRaw.split(',').map((f) => f.trim());

  return { flows, baseUrl, headed };
}

// --- Helpers ---

function getHeadSha(): string {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function getChangedFiles(): string[] {
  try {
    const base = process.env.BASE_REF || 'main';
    return execSync(`git diff --name-only origin/${base}...HEAD`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function detectRequiredFlows(): string[] {
  const changed = getChangedFiles();
  if (changed.length === 0) return FLOW_DEFINITIONS.map((f) => f.name);

  const required = new Set<string>();
  for (const file of changed) {
    for (const mapping of FILE_FLOW_MAP) {
      if (mapping.pattern.test(file)) {
        mapping.flows.forEach((f) => required.add(f));
      }
    }
  }

  return required.size > 0 ? Array.from(required) : [];
}

// --- Capture ---

async function captureFlows(args: CliArgs): Promise<EvidenceManifest> {
  // import playwright - try root first, then frontend/node_modules
  let chromium: typeof import('playwright').chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    try {
      const frontendPath = resolve('frontend/node_modules/playwright');
      const pw = await import(frontendPath);
      chromium = pw.chromium;
    } catch {
      console.error('ERROR: playwright is not installed.');
      console.error('Run: cd frontend && npm add -D playwright && npx playwright install chromium');
      process.exit(2);
    }
  }

  // ensure output directories
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const requestedFlows = FLOW_DEFINITIONS.filter((f) => args.flows.includes(f.name));
  if (requestedFlows.length === 0) {
    console.error('ERROR: no matching flows found for: ' + args.flows.join(', '));
    process.exit(2);
  }

  const testEmail = process.env.TEST_USER_EMAIL || 'test@tarmacview.local';
  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const results: FlowResult[] = [];

  for (const flow of requestedFlows) {
    const startTime = Date.now();
    const url = args.baseUrl.replace(/\/$/, '') + flow.path;
    const screenshotPath = pathJoin(SCREENSHOTS_DIR, flow.name + '.png');
    const consoleErrors: string[] = [];

    const page = await context.newPage();

    // collect console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const finalUrl = new URL(page.url());

      results.push({
        name: flow.name,
        entrypoint: flow.path,
        screenshot: screenshotPath,
        consoleErrors,
        finalUrl: finalUrl.pathname + finalUrl.search,
        accountIdentity: flow.requiresAuth ? testEmail : null,
        durationMs: Date.now() - startTime,
      });

      console.log(`  ✔ ${flow.name} → ${screenshotPath} (${Date.now() - startTime}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      consoleErrors.push(`capture failed: ${msg}`);

      results.push({
        name: flow.name,
        entrypoint: flow.path,
        screenshot: screenshotPath,
        consoleErrors,
        finalUrl: flow.path,
        accountIdentity: flow.requiresAuth ? testEmail : null,
        durationMs: Date.now() - startTime,
      });

      console.error(`  ✘ ${flow.name}: ${msg}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  return {
    capturedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    captureMode: 'playwright',
    flows: results,
  };
}

// --- Main ---

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('Browser Evidence Capture');
  console.log('========================');
  console.log(`  base-url: ${args.baseUrl}`);
  console.log(`  headed:   ${args.headed}`);

  // detect flows if "all" was requested
  if (args.flows.length === FLOW_DEFINITIONS.length) {
    const detected = detectRequiredFlows();
    if (detected.length > 0 && detected.length < FLOW_DEFINITIONS.length) {
      args.flows = detected;
      console.log(`  flows (auto-detected): ${args.flows.join(', ')}`);
    } else {
      console.log(`  flows: all (${args.flows.join(', ')})`);
    }
  } else {
    console.log(`  flows: ${args.flows.join(', ')}`);
  }

  console.log('');

  const manifest = await captureFlows(args);

  // write manifest
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to ${MANIFEST_PATH}`);

  // summary
  const failed = manifest.flows.filter((f) => {
    const hasScreenshot = existsSync(f.screenshot) && statSync(f.screenshot).size > 0;
    return !hasScreenshot || f.consoleErrors.some((e) => e.startsWith('capture failed:'));
  });

  console.log(`\nSummary: ${manifest.flows.length - failed.length}/${manifest.flows.length} flows captured`);
  console.log(`  SHA: ${manifest.headSha}`);
  console.log(`  Timestamp: ${manifest.capturedAt}`);

  if (failed.length > 0) {
    console.error(`\n${failed.length} flow(s) failed capture`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('ERROR: ' + (err instanceof Error ? err.message : String(err)));
  process.exit(2);
});
