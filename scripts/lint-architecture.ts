#!/usr/bin/env node
/**
 * Architectural Boundary Linter — Python/FastAPI Edition
 *
 * Enforces module dependency direction rules for the TarmacView backend by
 * statically analyzing Python import statements. Rules are loaded from:
 *
 *   1. scripts/lint-architecture-config.json  (dedicated override)
 *   2. harness.config.json → architecturalBoundaries  (canonical source)
 *   3. Built-in defaults matching project layer hierarchy
 *
 * Layer hierarchy:
 *   routes → services → models/schemas ← core (foundation)
 *   - routes never import models directly (must go through services)
 *   - schemas are pure DTOs — no imports from other app layers
 *   - core is self-contained (config, database, auth, dependencies)
 *
 * Zero external dependencies — uses only Node.js built-ins for file discovery
 * and regex-based import extraction. Runs in < 2 s on a typical project.
 *
 * Usage:
 *   npx tsx scripts/lint-architecture.ts [options]
 *
 * Options:
 *   --json       Output violations as JSON array
 *   --summary    Output violation counts per layer pair only
 *   --fix        Print refactoring hints for each violation
 *   --verbose    Print every scanned file and its layer assignment
 *
 * Exit codes:
 *   0  No violations
 *   1  One or more violations found
 *   2  Configuration or runtime error
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LayerRule {
  name: string;
  patterns: string[];
  canDependOn: string[];
  /** python module prefix used in import statements (e.g. "app.models") */
  modulePrefix: string;
}

interface Violation {
  file: string;
  line: number;
  importPath: string;
  fromLayer: string;
  toLayer: string;
  rule: string;
}

interface LintResult {
  violations: Violation[];
  filesScanned: number;
  layerCounts: Record<string, number>;
}

interface LintConfig {
  layers: LayerRule[];
  ignorePatterns: string[];
  exemptComment: string;
  srcRoot: string;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const FLAG_JSON = args.has('--json');
const FLAG_SUMMARY = args.has('--summary');
const FLAG_FIX = args.has('--fix');
const FLAG_VERBOSE = args.has('--verbose');

// ---------------------------------------------------------------------------
// Repo root discovery
// ---------------------------------------------------------------------------

function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();

// ---------------------------------------------------------------------------
// File discovery (zero dependencies — recursive readdir)
// ---------------------------------------------------------------------------

/** segments to skip entirely during directory traversal */
const SKIP_DIRS = new Set(['__pycache__', '.git', 'node_modules', 'dist', 'build', '.venv', 'venv']);

/**
 * Recursively collect all .py files under a directory.
 * Returns paths relative to REPO_ROOT.
 */
function findPythonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPythonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.py')) {
      results.push(relative(REPO_ROOT, fullPath));
    }
  }
  return results;
}

/**
 * Check if a relative file path should be ignored based on config patterns.
 * Supports simple glob-like patterns: ** (any depth), * (single segment).
 */
function shouldIgnore(filePath: string, ignorePatterns: string[]): boolean {
  for (const pattern of ignorePatterns) {
    if (matchGlob(filePath, pattern)) return true;
  }
  return false;
}

function matchGlob(filePath: string, pattern: string): boolean {
  // convert glob to regex
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*\//g, '(.+/)?')
    .replace(/\*\*/g, '.*')
    .replace(/(?<!\.)(\*)/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  regex = `^${regex}$`;
  return new RegExp(regex).test(filePath);
}

// ---------------------------------------------------------------------------
// Configuration loading (three-tier fallback)
// ---------------------------------------------------------------------------

function loadConfig(): LintConfig {
  // --- Priority 1: dedicated config in scripts/ ---
  const overridePath = join(REPO_ROOT, 'scripts', 'lint-architecture-config.json');
  if (existsSync(overridePath)) {
    try {
      const raw = JSON.parse(readFileSync(overridePath, 'utf8'));
      return {
        layers: raw.layers,
        ignorePatterns: raw.ignorePatterns ?? defaultIgnore(),
        exemptComment: raw.exemptComment ?? 'arch-exempt',
        srcRoot: raw.srcRoot ?? 'backend/app',
      };
    } catch (err) {
      fatal(`Failed to parse ${overridePath}: ${errMsg(err)}`);
    }
  }

  // --- Priority 2: harness.config.json (canonical) ---
  const harnessPath = join(REPO_ROOT, 'harness.config.json');
  if (existsSync(harnessPath)) {
    try {
      const raw = JSON.parse(readFileSync(harnessPath, 'utf8'));
      const boundaries: Record<string, { allowedImports?: string[] }> =
        raw.architecturalBoundaries ?? {};
      if (Object.keys(boundaries).length > 0) {
        const layers: LayerRule[] = Object.entries(boundaries).map(([name, def]) => ({
          name,
          patterns: [`backend/app/${name}/**`],
          canDependOn: def.allowedImports ?? [],
          modulePrefix: `app.${name}`,
        }));
        return {
          layers,
          ignorePatterns: defaultIgnore(),
          exemptComment: 'arch-exempt',
          srcRoot: 'backend/app',
        };
      }
    } catch (err) {
      fatal(`Failed to parse ${harnessPath}: ${errMsg(err)}`);
    }
  }

  // --- Priority 3: built-in defaults matching project conventions ---
  return {
    layers: defaultLayers(),
    ignorePatterns: defaultIgnore(),
    exemptComment: 'arch-exempt',
    srcRoot: 'backend/app',
  };
}

/**
 * Default layer definitions derived from project conventions:
 *   routes → services → models/schemas
 *   routes never import models directly
 *   core is the foundation layer (config, database, auth)
 */
function defaultLayers(): LayerRule[] {
  return [
    {
      name: 'routes',
      patterns: ['backend/app/api/routes/**'],
      canDependOn: ['services', 'schemas', 'core'],
      modulePrefix: 'app.api.routes',
    },
    {
      name: 'services',
      patterns: ['backend/app/services/**'],
      canDependOn: ['models', 'schemas', 'core'],
      modulePrefix: 'app.services',
    },
    {
      name: 'models',
      patterns: ['backend/app/models/**'],
      canDependOn: ['core'],
      modulePrefix: 'app.models',
    },
    {
      name: 'schemas',
      patterns: ['backend/app/schemas/**'],
      canDependOn: [],
      modulePrefix: 'app.schemas',
    },
    {
      name: 'core',
      patterns: ['backend/app/core/**'],
      canDependOn: [],
      modulePrefix: 'app.core',
    },
  ];
}

function defaultIgnore(): string[] {
  return [
    '**/*.pyc',
    '**/__pycache__/**',
    '**/tests/**',
    '**/test_*',
    '**/conftest.py',
    '**/migrations/**',
  ];
}

// ---------------------------------------------------------------------------
// Layer resolution
// ---------------------------------------------------------------------------

/**
 * Determine which layer a file belongs to by checking its path against
 * each layer's directory prefix.
 *
 * Special case: routes live under api/routes/, not directly under srcRoot.
 */
function resolveFileLayer(filePath: string, layers: LayerRule[]): string | null {
  for (const layer of layers) {
    for (const pattern of layer.patterns) {
      // convert glob prefix to a directory prefix check
      // e.g. "backend/app/api/routes/**" → "backend/app/api/routes/"
      const dirPrefix = pattern.replace(/\*\*$/, '');
      if (filePath.startsWith(dirPrefix)) return layer.name;
    }
  }
  return null;
}

/**
 * Resolve a Python import module path to a target layer.
 *
 * Maps "app.models.airport" → "models", "app.api.routes.missions" → "routes", etc.
 * Returns null for third-party imports or imports outside declared layers.
 */
function resolveImportToLayer(importModule: string, layers: LayerRule[]): string | null {
  for (const layer of layers) {
    if (
      importModule === layer.modulePrefix ||
      importModule.startsWith(layer.modulePrefix + '.')
    ) {
      return layer.name;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Python import extraction (regex — no AST dependency)
// ---------------------------------------------------------------------------

// "from app.models.airport import Airport"  →  captures "app.models.airport"
const RE_FROM_IMPORT = /^\s*from\s+(app\.[a-zA-Z0-9_.]+)\s+import\b/;

// "import app.core.config"  →  captures "app.core.config"
const RE_PLAIN_IMPORT = /^\s*import\s+(app\.[a-zA-Z0-9_.]+)/;

interface ExtractedImport {
  /** the full module path (e.g. "app.models.airport") */
  module: string;
  /** 1-based line number */
  line: number;
}

/**
 * Extract all app-internal import statements from a Python source string.
 * Only captures imports starting with "app." (the project's own modules).
 * Third-party and stdlib imports are ignored.
 */
function extractPythonImports(source: string): ExtractedImport[] {
  const results: ExtractedImport[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];

    // skip comments and blank lines for speed
    const trimmed = lineText.trimStart();
    if (trimmed.startsWith('#') || trimmed === '') continue;

    // "from app.X import Y"
    const fromMatch = RE_FROM_IMPORT.exec(lineText);
    if (fromMatch) {
      results.push({ module: fromMatch[1], line: i + 1 });
      continue;
    }

    // "import app.X"
    const plainMatch = RE_PLAIN_IMPORT.exec(lineText);
    if (plainMatch) {
      results.push({ module: plainMatch[1], line: i + 1 });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Core lint engine
// ---------------------------------------------------------------------------

function lint(config: LintConfig): LintResult {
  const violations: Violation[] = [];
  const layerCounts: Record<string, number> = {};

  for (const layer of config.layers) {
    layerCounts[layer.name] = 0;
  }

  // pre-compute allow-set per layer for O(1) lookup
  const allowMap = new Map<string, Set<string>>();
  for (const layer of config.layers) {
    allowMap.set(layer.name, new Set(layer.canDependOn));
  }

  const knownLayers = new Set(config.layers.map((l) => l.name));

  // collect all layer directories and find .py files
  const layerDirs = config.layers.flatMap((l) =>
    l.patterns.map((p) => p.replace(/\/?\*\*.*$/, ''))
  );

  const allFiles: string[] = [];
  for (const dir of layerDirs) {
    const absDir = join(REPO_ROOT, dir);
    const files = findPythonFiles(absDir);
    // filter ignored files
    for (const f of files) {
      if (!shouldIgnore(f, config.ignorePatterns)) {
        allFiles.push(f);
      }
    }
  }

  for (const file of allFiles) {
    const fromLayer = resolveFileLayer(file, config.layers);
    if (!fromLayer) continue;

    layerCounts[fromLayer]++;

    // skip __init__.py files that are typically empty or just re-exports
    if (file.endsWith('__init__.py')) {
      const absPath = join(REPO_ROOT, file);
      const content = readFileSync(absPath, 'utf8').trim();
      if (content === '' || content.split('\n').length <= 3) {
        continue;
      }
    }

    if (FLAG_VERBOSE) {
      process.stderr.write(`  [${fromLayer}] ${file}\n`);
    }

    const absPath = join(REPO_ROOT, file);
    const source = readFileSync(absPath, 'utf8');
    const imports = extractPythonImports(source);
    const lines = source.split('\n');
    const allowed = allowMap.get(fromLayer)!;

    for (const imp of imports) {
      // check for inline exemption comment
      const lineText = lines[imp.line - 1] ?? '';
      if (lineText.includes(`# ${config.exemptComment}`)) continue;

      const toLayer = resolveImportToLayer(imp.module, config.layers);

      // skip: third-party import, unresolved, or same-layer
      if (!toLayer) continue;
      if (toLayer === fromLayer) continue;
      if (!knownLayers.has(toLayer)) continue;

      if (!allowed.has(toLayer)) {
        const allowedList = [...allowed].sort().join(', ') || 'none';
        violations.push({
          file,
          line: imp.line,
          importPath: imp.module,
          fromLayer,
          toLayer,
          rule: `"${fromLayer}" cannot import from "${toLayer}" (allowed: [${allowedList}])`,
        });
      }
    }
  }

  return { violations, filesScanned: allFiles.length, layerCounts };
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function printHumanReadable(result: LintResult, config: LintConfig): void {
  const { violations, filesScanned, layerCounts } = result;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Architectural Boundary Linter (Python)         ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();
  console.log(`Files scanned: ${filesScanned}`);
  console.log(
    `Layers: ${Object.entries(layerCounts)
      .map(([k, v]) => `${k} (${v})`)
      .join(', ')}`,
  );
  console.log();

  if (violations.length === 0) {
    console.log(`✔ All architectural boundaries respected (${config.layers.length} layers checked)`);
    return;
  }

  console.log(`✘ Found ${violations.length} violation(s):\n`);

  for (const v of violations) {
    console.log(`  VIOLATION: ${v.file}:${v.line}`);
    console.log(`    Import: ${v.importPath}`);
    console.log(`    Rule:   ${v.rule}`);
    if (FLAG_FIX) {
      console.log(`    Fix:    ${suggestFix(v, config)}`);
    }
    console.log();
  }

  console.log('To fix: update the import to respect the layer rules, or update');
  console.log('scripts/lint-architecture-config.json if the dependency is intentional.');
  console.log('To exempt a single line, add: # arch-exempt: <reason>');
}

function printSummary(result: LintResult): void {
  const { violations } = result;
  if (violations.length === 0) {
    console.log('✔ No violations.');
    return;
  }

  const counts = new Map<string, number>();
  for (const v of violations) {
    const key = `${v.fromLayer} → ${v.toLayer}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  console.log(`✘ ${violations.length} violation(s) across ${counts.size} layer pair(s):\n`);
  for (const [pair, count] of [...counts.entries()].sort()) {
    console.log(`  ${pair}: ${count}`);
  }
}

function printJson(result: LintResult): void {
  console.log(JSON.stringify(result.violations, null, 2));
}

// ---------------------------------------------------------------------------
// Fix suggestions
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable refactoring hint for a violation.
 *
 * Strategies (in order of preference):
 *   1. Route through an intermediary layer.
 *   2. Extract shared types into a lower layer.
 *   3. Widen the boundary rule if architecturally sound.
 */
function suggestFix(v: Violation, config: LintConfig): string {
  const fromRule = config.layers.find((l) => l.name === v.fromLayer);
  if (!fromRule) return 'Review the import and update layer rules.';

  // the most common violation: routes importing models directly
  if (v.fromLayer === 'routes' && v.toLayer === 'models') {
    return (
      'Move the data access logic into a service function in backend/app/services/ ' +
      'and import the service from your route handler instead.'
    );
  }

  // schemas importing models
  if (v.fromLayer === 'schemas' && v.toLayer === 'models') {
    return (
      'Schemas (Pydantic DTOs) must not depend on SQLAlchemy models. ' +
      'Define the schema fields independently — the service layer handles conversion.'
    );
  }

  // models importing services (circular)
  if (v.fromLayer === 'models' && v.toLayer === 'services') {
    return (
      'Models must not import services (circular dependency). ' +
      'Move the logic to the service layer or use events/signals for side effects.'
    );
  }

  // models importing routes (severe violation)
  if (v.fromLayer === 'models' && v.toLayer === 'routes') {
    return (
      'Models must never import from the API layer. ' +
      'This creates a circular dependency — restructure to keep models independent.'
    );
  }

  // services importing routes (reverse dependency)
  if (v.fromLayer === 'services' && v.toLayer === 'routes') {
    return (
      'Services must not import routes (reverse dependency). ' +
      'The API layer depends on services, not the other way around.'
    );
  }

  // check for intermediary layers
  const intermediaries: string[] = [];
  for (const allowed of fromRule.canDependOn) {
    const intermediary = config.layers.find((l) => l.name === allowed);
    if (intermediary && intermediary.canDependOn.includes(v.toLayer)) {
      intermediaries.push(allowed);
    }
  }

  if (intermediaries.length > 0) {
    return (
      `Route through "${intermediaries[0]}" layer — move the logic that depends on ` +
      `"${v.toLayer}" into backend/app/${intermediaries[0]}/ ` +
      `and import from there instead.`
    );
  }

  const fromAllowedStr = fromRule.canDependOn.join(', ') || 'none';
  return (
    `Either extract shared types into a layer both "${v.fromLayer}" and "${v.toLayer}" ` +
    `can access, or add "${v.toLayer}" to ${v.fromLayer}.canDependOn in ` +
    `scripts/lint-architecture-config.json (currently: [${fromAllowedStr}]).`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function fatal(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const config = loadConfig();

  if (FLAG_VERBOSE) {
    console.error(`Config loaded: ${config.layers.length} layers, srcRoot="${config.srcRoot}"`);
    for (const l of config.layers) {
      console.error(`  ${l.name} (${l.modulePrefix}) → canDependOn: [${l.canDependOn.join(', ')}]`);
    }
    console.error();
  }

  const result = lint(config);

  if (FLAG_JSON) {
    printJson(result);
  } else if (FLAG_SUMMARY) {
    printSummary(result);
  } else {
    printHumanReadable(result, config);
  }

  process.exit(result.violations.length > 0 ? 1 : 0);
}

main();
