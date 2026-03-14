#!/usr/bin/env npx tsx
// ============================================================================
// Browser Evidence Verifier — validates evidence manifest for PR gating
//
// Checks that captured browser evidence is complete, fresh, and error-free.
// Runs after the capture step to gate the PR on visual evidence quality.
//
// Usage:
//   npx tsx scripts/harness-ui-verify-browser-evidence.ts [options]
//
// Options:
//   --dir <path>          Evidence directory (default: .harness/evidence)
//   --max-age <minutes>   Maximum evidence age in minutes (default: 60)
//   --require-flows <n>   Comma-separated flow names to require (optional)
//
// Exit codes:
//   0  All assertions pass
//   1  One or more assertions failed
//   2  Configuration or runtime error
// ============================================================================

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Types ---

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

// --- CLI ---

interface CliArgs {
  dir: string;
  maxAgeMinutes: number;
  requireFlows: string[];
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let dir = '.harness/evidence';
  let maxAgeMinutes = 60;
  let requireFlowsRaw = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = args[++i];
    if (args[i] === '--max-age' && args[i + 1]) maxAgeMinutes = parseInt(args[++i], 10);
    if (args[i] === '--require-flows' && args[i + 1]) requireFlowsRaw = args[++i];
  }

  const requireFlows = requireFlowsRaw
    ? requireFlowsRaw.split(',').map((f) => f.trim())
    : [];

  return { dir: resolve(dir), maxAgeMinutes, requireFlows };
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

// --- Verification ---

interface Assertion {
  label: string;
  passed: boolean;
  detail: string;
}

function verify(args: CliArgs): Assertion[] {
  const assertions: Assertion[] = [];
  const manifestPath = resolve(args.dir, 'manifest.json');

  // 1. manifest exists and is valid JSON
  if (!existsSync(manifestPath)) {
    assertions.push({
      label: 'manifest exists',
      passed: false,
      detail: `not found at ${manifestPath}`,
    });
    return assertions;
  }

  let manifest: EvidenceManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assertions.push({
      label: 'manifest valid JSON',
      passed: false,
      detail: msg,
    });
    return assertions;
  }

  assertions.push({
    label: 'manifest exists',
    passed: true,
    detail: `${manifest.flows.length} flow(s), mode: ${manifest.captureMode}`,
  });

  // 2. required flows present
  if (args.requireFlows.length > 0) {
    const presentNames = new Set(manifest.flows.map((f) => f.name));
    const missing = args.requireFlows.filter((f) => !presentNames.has(f));
    assertions.push({
      label: 'required flows present',
      passed: missing.length === 0,
      detail: missing.length === 0
        ? `all ${args.requireFlows.length} required flow(s) found`
        : `missing: ${missing.join(', ')}`,
    });
  }

  // 3. each flow has a valid, non-empty screenshot
  for (const flow of manifest.flows) {
    const screenshotExists = existsSync(flow.screenshot);
    const screenshotSize = screenshotExists ? statSync(flow.screenshot).size : 0;

    assertions.push({
      label: `screenshot: ${flow.name}`,
      passed: screenshotExists && screenshotSize > 0,
      detail: screenshotExists
        ? `${(screenshotSize / 1024).toFixed(1)} KB`
        : 'file not found',
    });
  }

  // 4. SHA matches current HEAD (evidence is fresh, not stale)
  const currentSha = getHeadSha();
  const shaMatch = manifest.headSha === currentSha || currentSha === 'unknown';
  assertions.push({
    label: 'SHA matches HEAD',
    passed: shaMatch,
    detail: shaMatch
      ? `${manifest.headSha.slice(0, 12)}`
      : `manifest: ${manifest.headSha.slice(0, 12)}, HEAD: ${currentSha.slice(0, 12)}`,
  });

  // 5. no console errors in any flow (warnings are OK)
  for (const flow of manifest.flows) {
    // filter out capture-failure messages — those are caught by screenshot check
    const realErrors = flow.consoleErrors.filter((e) => !e.startsWith('capture failed:'));
    assertions.push({
      label: `no console errors: ${flow.name}`,
      passed: realErrors.length === 0,
      detail: realErrors.length === 0
        ? 'clean'
        : `${realErrors.length} error(s): ${realErrors[0]}`,
    });
  }

  // 6. auth flows have account identity
  for (const flow of manifest.flows) {
    if (flow.accountIdentity !== null || flow.entrypoint === '/') continue;
    // only flag flows that look like they need auth but have no identity
    assertions.push({
      label: `auth identity: ${flow.name}`,
      passed: flow.accountIdentity !== null,
      detail: flow.accountIdentity ?? 'missing — auth flow without identity',
    });
  }

  // 7. evidence freshness
  const capturedAt = new Date(manifest.capturedAt).getTime();
  const now = Date.now();
  const ageMinutes = (now - capturedAt) / 60_000;
  const fresh = ageMinutes <= args.maxAgeMinutes;
  assertions.push({
    label: 'evidence freshness',
    passed: fresh,
    detail: fresh
      ? `${ageMinutes.toFixed(1)} min old (limit: ${args.maxAgeMinutes} min)`
      : `${ageMinutes.toFixed(1)} min old — exceeds ${args.maxAgeMinutes} min limit`,
  });

  return assertions;
}

// --- Main ---

function main(): void {
  const args = parseArgs();

  console.log('Browser Evidence Verifier');
  console.log('========================');
  console.log(`  dir:     ${args.dir}`);
  console.log(`  max-age: ${args.maxAgeMinutes} min`);
  if (args.requireFlows.length > 0) {
    console.log(`  require: ${args.requireFlows.join(', ')}`);
  }
  console.log('');

  const assertions = verify(args);
  let failures = 0;

  for (const a of assertions) {
    const icon = a.passed ? '✔' : '✘';
    const line = `  ${icon} ${a.label}: ${a.detail}`;
    if (a.passed) {
      console.log(line);
    } else {
      console.error(line);
      failures++;
    }
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures}/${assertions.length} assertion(s) failed`);
    process.exit(1);
  }

  console.log(`All ${assertions.length} assertion(s) passed.`);
}

main();
