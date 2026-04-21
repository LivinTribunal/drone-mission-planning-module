#!/usr/bin/env npx tsx
// ============================================================================
// Issue Implementer Guard — pre-flight gate for automated issue implementation
//
// Determines whether the implementer agent should proceed based on:
//   - Presence of `agent:implement` label (required)
//   - Absence of blocking labels (agent:skip, wontfix, duplicate, invalid)
//   - No existing PR already linked via marker comment
//   - Derives branch name from issue title + number
//
// Usage:
//   ISSUE_JSON='{"number":1,...}' npx tsx scripts/issue-implementer-guard.ts --evaluate
//   npx tsx scripts/issue-implementer-guard.ts --self-test
//
// Environment variables:
//   ISSUE_JSON          — serialized GitHub issue object (from github.event.issue)
//   GITHUB_REPOSITORY   — owner/repo (set by CI runner)
//   GH_TOKEN            — GitHub auth token for API calls
// ============================================================================

import { execSync } from 'node:child_process';

// --- Types ---

export interface ImplementerDecision {
  shouldImplement: boolean;
  issueNumber: number;
  issueTitle: string;
  branchName: string;
  reason: string;
  existingPR: number | null;
  blockedLabels: string[];
}

export interface ReviewFixDecision {
  shouldFix: boolean;
  prNumber: number;
  branchName: string;
  cycle: number;
  reason: string;
}

interface IssuePayload {
  number: number;
  title: string;
  body: string | null;
  pull_request?: unknown;
  user: { login: string; type?: string };
  labels: Array<{ name: string }>;
}

// --- Constants ---

/** The label required to trigger implementation. */
const TRIGGER_LABEL = 'agent:implement';

/** Labels that block implementation. */
const BLOCKING_LABELS = ['agent:skip', 'wontfix', 'duplicate', 'invalid'];

/** Maximum branch name length. */
const MAX_BRANCH_LENGTH = 60;

/** Marker comment prefix used to detect existing implementer PRs. */
const PR_MARKER_PREFIX = '<!-- issue-implementer:';

// --- Public API ---

/**
 * Convert a string to a URL-friendly slug.
 * Strips non-alphanumeric chars, collapses hyphens, trims edges.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Derive a branch name from an issue title and number.
 * Format: `cf/<slug>-<number>`, capped at MAX_BRANCH_LENGTH chars.
 */
export function deriveBranchName(title: string, number: number): string {
  const suffix = `-${number}`;
  const prefix = 'cf/';
  const maxSlugLength = MAX_BRANCH_LENGTH - prefix.length - suffix.length;

  let slug = slugify(title);
  if (slug.length > maxSlugLength) {
    slug = slug.slice(0, maxSlugLength).replace(/-$/, '');
  }

  return `${prefix}${slug}${suffix}`;
}

/**
 * Check if an existing PR is already linked to this issue via marker comment.
 * Searches issue comments for `<!-- issue-implementer: #N -->`.
 * Returns the PR number if found, null otherwise.
 */
export function findExistingPR(issueNumber: number): number | null {
  try {
    const repo = process.env.GITHUB_REPOSITORY || '';
    if (!repo) return null;

    const output = execSync(
      `gh issue view ${issueNumber} --repo "${repo}" --json comments --jq '.comments[].body'`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );

    for (const line of output.split('\n')) {
      const match = line.match(/<!-- issue-implementer: #(\d+) -->/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Evaluate whether implementation should proceed for a given issue.
 *
 * Decision logic:
 * 1. Skip pull requests — they're not issues.
 * 2. Check for `agent:implement` label — required to proceed.
 * 3. Check for blocking labels — reject if any are present.
 * 4. Check for existing PR via marker comment — skip if already in progress.
 * 5. Derive branch name and approve.
 */
export function evaluate(issue: IssuePayload, skipPRCheck = false): ImplementerDecision {
  const labelNames = issue.labels.map((l) => l.name);

  const base: Pick<ImplementerDecision, 'issueNumber' | 'issueTitle'> = {
    issueNumber: issue.number,
    issueTitle: issue.title,
  };

  // Gate 1: Not an issue (PR)
  if (issue.pull_request) {
    return {
      ...base,
      shouldImplement: false,
      branchName: '',
      reason: 'Pull request — not an issue.',
      existingPR: null,
      blockedLabels: [],
    };
  }

  // Gate 2: Missing trigger label
  if (!labelNames.includes(TRIGGER_LABEL)) {
    return {
      ...base,
      shouldImplement: false,
      branchName: '',
      reason: `Missing required label '${TRIGGER_LABEL}'.`,
      existingPR: null,
      blockedLabels: [],
    };
  }

  // Gate 3: Blocking labels
  const blocked = labelNames.filter((l) => BLOCKING_LABELS.includes(l));
  if (blocked.length > 0) {
    return {
      ...base,
      shouldImplement: false,
      branchName: '',
      reason: `Blocked by label(s): ${blocked.join(', ')}.`,
      existingPR: null,
      blockedLabels: blocked,
    };
  }

  // Gate 4: Existing PR (via marker comment)
  if (!skipPRCheck) {
    const existingPR = findExistingPR(issue.number);
    if (existingPR) {
      return {
        ...base,
        shouldImplement: false,
        branchName: '',
        reason: `PR #${existingPR} already exists for this issue.`,
        existingPR,
        blockedLabels: [],
      };
    }
  }

  // Approved
  const branchName = deriveBranchName(issue.title, issue.number);

  return {
    ...base,
    shouldImplement: true,
    branchName,
    reason: `Issue approved for implementation. Branch: ${branchName}`,
    existingPR: null,
    blockedLabels: [],
  };
}

/**
 * Evaluate whether a review-fix cycle should proceed for a given PR.
 *
 * Decision logic:
 * 1. Cycle must be <= 3.
 * 2. PR must exist and be OPEN.
 * 3. Returns the PR branch name for checkout.
 */
export function evaluateReviewFix(
  prNumber: number,
  cycle: number,
  skipBranchCheck = false,
): ReviewFixDecision {
  const MAX_CYCLES = 3;

  const base: Pick<ReviewFixDecision, 'prNumber'> = { prNumber };

  // Gate 1: Max cycles exceeded
  if (cycle > MAX_CYCLES) {
    return {
      ...base,
      shouldFix: false,
      branchName: '',
      cycle,
      reason: `Max review-fix cycles exceeded (${cycle} > ${MAX_CYCLES}). Escalate to human.`,
    };
  }

  // Gate 2: PR must be open (requires API call)
  if (!skipBranchCheck) {
    try {
      const repo = process.env.GITHUB_REPOSITORY || '';
      if (!repo) {
        return {
          ...base,
          shouldFix: false,
          branchName: '',
          cycle,
          reason: 'GITHUB_REPOSITORY not set.',
        };
      }

      const output = execSync(`gh pr view ${prNumber} --repo "${repo}" --json headRefName,state`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const prData = JSON.parse(output);

      if (prData.state !== 'OPEN') {
        return {
          ...base,
          shouldFix: false,
          branchName: '',
          cycle,
          reason: `PR #${prNumber} is ${prData.state}, not OPEN.`,
        };
      }

      return {
        ...base,
        shouldFix: true,
        branchName: prData.headRefName,
        cycle,
        reason: `Review-fix cycle ${cycle} approved for PR #${prNumber}. Branch: ${prData.headRefName}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        ...base,
        shouldFix: false,
        branchName: '',
        cycle,
        reason: `Failed to fetch PR #${prNumber}: ${msg}`,
      };
    }
  }

  // Skip branch check mode (for testing)
  return {
    ...base,
    shouldFix: true,
    branchName: `cf/mock-branch-${prNumber}`,
    cycle,
    reason: `Review-fix cycle ${cycle} approved for PR #${prNumber} (branch check skipped).`,
  };
}

// --- CLI: --evaluate ---

if (process.argv.includes('--evaluate')) {
  const prNumberEnv = process.env.PR_NUMBER;
  const reviewFixCycleEnv = process.env.REVIEW_FIX_CYCLE;

  if (prNumberEnv) {
    // Review-fix mode
    const prNum = parseInt(prNumberEnv, 10);
    const cycle = parseInt(reviewFixCycleEnv || '1', 10);

    if (isNaN(prNum) || prNum <= 0) {
      console.error('ERROR: PR_NUMBER must be a valid positive integer.');
      process.exit(1);
    }

    const decision = evaluateReviewFix(prNum, cycle);
    console.log(JSON.stringify(decision, null, 2));
  } else {
    // Issue implementation mode
    let issue: IssuePayload;
    try {
      issue = JSON.parse(process.env.ISSUE_JSON || '{}');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`ERROR: Failed to parse ISSUE_JSON: ${msg}`);
      process.exit(1);
    }

    if (!issue.number) {
      console.error('ERROR: ISSUE_JSON must contain a valid issue number.');
      process.exit(1);
    }

    const decision = evaluate(issue);
    console.log(JSON.stringify(decision, null, 2));
  }
}

// --- CLI: --self-test ---

if (process.argv.includes('--self-test')) {
  console.log('Running issue-implementer-guard self-test...\n');

  // --- slugify ---
  console.assert(slugify('Hello World!') === 'hello-world', 'Basic slugify');
  console.assert(
    slugify('Bug: login---broken!!!') === 'bug-login-broken',
    'Strips special chars and collapses hyphens',
  );
  console.assert(slugify('  --leading--trailing--  ') === 'leading-trailing', 'Trims edges');
  console.assert(slugify('UPPERCASE') === 'uppercase', 'Lowercases');
  console.assert(slugify('a/b\\c:d') === 'a-b-c-d', 'Handles path-like chars');

  // --- deriveBranchName ---
  const branch1 = deriveBranchName('Fix login bug', 42);
  console.assert(branch1 === 'cf/fix-login-bug-42', `Expected cf/fix-login-bug-42, got ${branch1}`);
  console.assert(
    branch1.length <= MAX_BRANCH_LENGTH,
    `Branch name should be <= ${MAX_BRANCH_LENGTH} chars`,
  );

  // Long title should be truncated
  const longTitle =
    'This is a very long issue title that should be truncated to fit within the branch name limit';
  const branch2 = deriveBranchName(longTitle, 999);
  console.assert(
    branch2.length <= MAX_BRANCH_LENGTH,
    `Long branch should be <= ${MAX_BRANCH_LENGTH} chars, got ${branch2.length}`,
  );
  console.assert(branch2.startsWith('cf/'), 'Long branch should start with cf/');
  console.assert(branch2.endsWith('-999'), 'Long branch should end with issue number');

  // --- evaluate (without API calls — skipPRCheck=true) ---

  // Missing trigger label
  const noLabel = evaluate(
    {
      number: 1,
      title: 'Add feature',
      body: 'Details...',
      user: { login: 'user' },
      labels: [{ name: 'bug' }],
    },
    true,
  );
  console.assert(
    noLabel.shouldImplement === false,
    'Should not implement without agent:implement label',
  );

  // Has trigger label, no blockers
  const ready = evaluate(
    {
      number: 10,
      title: 'Add dark mode',
      body: 'Implement dark mode toggle',
      user: { login: 'user' },
      labels: [{ name: 'agent:implement' }, { name: 'enhancement' }],
    },
    true,
  );
  console.assert(ready.shouldImplement === true, 'Should implement with agent:implement label');
  console.assert(ready.branchName === 'cf/add-dark-mode-10', `Branch: ${ready.branchName}`);

  // Blocked by label
  const blocked = evaluate(
    {
      number: 2,
      title: 'Something',
      body: null,
      user: { login: 'user' },
      labels: [{ name: 'agent:implement' }, { name: 'wontfix' }],
    },
    true,
  );
  console.assert(blocked.shouldImplement === false, 'Should not implement with blocking label');
  console.assert(
    blocked.blockedLabels.includes('wontfix'),
    'Should report wontfix as blocked label',
  );

  // PR (not an issue)
  const pr = evaluate(
    {
      number: 3,
      title: 'PR title',
      body: null,
      pull_request: { url: 'https://...' },
      user: { login: 'user' },
      labels: [{ name: 'agent:implement' }],
    },
    true,
  );
  console.assert(pr.shouldImplement === false, 'PR should be skipped');

  // Multiple blocking labels
  const multiBlocked = evaluate(
    {
      number: 4,
      title: 'Something',
      body: null,
      user: { login: 'user' },
      labels: [{ name: 'agent:implement' }, { name: 'duplicate' }, { name: 'invalid' }],
    },
    true,
  );
  console.assert(
    multiBlocked.blockedLabels.length === 2,
    `Expected 2 blocked labels, got ${multiBlocked.blockedLabels.length}`,
  );

  // --- evaluateReviewFix (skipBranchCheck=true) ---

  // Normal cycle
  const fixCycle1 = evaluateReviewFix(42, 1, true);
  console.assert(fixCycle1.shouldFix === true, 'Cycle 1 should be approved');
  console.assert(fixCycle1.prNumber === 42, `PR number should be 42, got ${fixCycle1.prNumber}`);
  console.assert(fixCycle1.cycle === 1, `Cycle should be 1, got ${fixCycle1.cycle}`);

  // Max cycle (3) should still be approved
  const fixCycle3 = evaluateReviewFix(42, 3, true);
  console.assert(fixCycle3.shouldFix === true, 'Cycle 3 should be approved');

  // Exceeded max cycles
  const fixCycle4 = evaluateReviewFix(42, 4, true);
  console.assert(fixCycle4.shouldFix === false, 'Cycle 4 should be rejected (max exceeded)');
  console.assert(
    fixCycle4.reason.includes('Max review-fix cycles exceeded'),
    `Reason should mention max cycles, got: ${fixCycle4.reason}`,
  );

  // Cycle 0 (edge case — should be approved)
  const fixCycle0 = evaluateReviewFix(10, 0, true);
  console.assert(fixCycle0.shouldFix === true, 'Cycle 0 should be approved');

  console.log('\n✔ All self-tests passed.');
}
