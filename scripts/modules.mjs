#!/usr/bin/env node

/**
 * scripts/modules.mjs — Module manifest validator and pruner.
 *
 * Commands:
 *   check                              Validate modules.json + markers.
 *   apply --db=<mongo|postgres>        Prune unselected modules (dry-run with --dry-run).
 *         [--without=<a,b>]
 *   list                               Show modules with their status.
 *
 * Node stdlib only (no npm deps). Designed for M11 of multirepo-final.
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(process.env.MODULES_ROOT || __dirname + '/..');

// ─── Manifest helpers ────────────────────────────────────────────────────────

/** @typedef {{ modules: ModuleDef[] }} Manifest */
/** @typedef {Object} ModuleDef */

function loadManifest() {
  const manifestPath = join(REPO_ROOT, 'modules.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`modules:check: manifest not found at ${manifestPath}`);
  }
  /** @type {Manifest} */
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return manifest;
}

function loadSchema() {
  const schemaPath = join(REPO_ROOT, 'modules.schema.json');
  if (!existsSync(schemaPath)) {
    throw new Error(`modules:check: schema not found at ${schemaPath}`);
  }
  return JSON.parse(readFileSync(schemaPath, 'utf8'));
}

// ─── Minimal JSON Schema validation (stdlib only) ────────────────────────────

/**
 * Validates `value` against a JSON Schema draft-07 subset. Throws with a precise
 * message (path + reason) on failure. Covers what modules.schema.json uses:
 * type, enum, required, additionalProperties, properties, items, pattern,
 * minItems, uniqueItems, minLength.
 */
function validateSchema(value, schema, path = '$') {
  if (schema.type) {
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (actual !== schema.type) {
      throw new Error(`schema: ${path} expected type ${schema.type}, got ${actual}`);
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw new Error(
      `schema: ${path} must be one of ${schema.enum.join(', ')}; got ${String(value)}`,
    );
  }
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    throw new Error(`schema: ${path} does not match pattern ${String(schema.pattern)}`);
  }
  if (
    typeof schema.minLength === 'number' &&
    typeof value === 'string' &&
    value.length < schema.minLength
  ) {
    throw new Error(`schema: ${path} must have length >= ${String(schema.minLength)}`);
  }
  if (
    typeof schema.minItems === 'number' &&
    Array.isArray(value) &&
    value.length < schema.minItems
  ) {
    throw new Error(`schema: ${path} must have >= ${String(schema.minItems)} items`);
  }
  if (schema.uniqueItems && Array.isArray(value)) {
    const seen = new Set();
    for (const item of value) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        throw new Error(`schema: ${path} has duplicate item ${key}`);
      }
      seen.add(key);
    }
  }
  if (
    schema.type === 'object' &&
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  ) {
    if (schema.required) {
      for (const key of schema.required) {
        if (!Object.hasOwn(value, key)) {
          throw new Error(`schema: ${path} missing required property "${key}"`);
        }
      }
    }
    const allowedKeys = schema.properties ? Object.keys(schema.properties) : [];
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!allowedKeys.includes(key)) {
          throw new Error(`schema: ${path} has unexpected property "${key}"`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (Object.hasOwn(value, key)) {
          validateSchema(value[key], propSchema, `${path}.${key}`);
        }
      }
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const known = schema.properties ? Object.keys(schema.properties) : [];
      for (const [key, val] of Object.entries(value)) {
        if (!known.includes(key)) {
          validateSchema(val, schema.additionalProperties, `${path}.${key}`);
        }
      }
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      validateSchema(value[i], schema.items, `${path}[${String(i)}]`);
    }
  }
}

// ─── Marker helpers ──────────────────────────────────────────────────────────

/**
 * Returns the comment prefix for a file. TS/JS/JSONC → `//`, YAML/env → `#`.
 */
function commentPrefix(filePath) {
  if (
    /\.(yaml|yml)$/.test(filePath) ||
    /\.env(\..*)?$/.test(filePath) ||
    filePath.endsWith('.env.example')
  ) {
    return '#';
  }
  // .ts, .tsx, .js, .mjs, .cjs, .mts, .cts, .json (turbo.json uses JSONC)
  return '//';
}

/**
 * Parses marker regions in a file. Returns an array of region objects with
 * `module`, `startLine`, `endLine` (1-based). Throws on unbalanced or unknown.
 */
function parseMarkerRegions(text, filePath) {
  const prefix = commentPrefix(filePath);
  const lines = text.split(/\r?\n/);
  /** @type {Array<{ module: string, startLine: number, endLine: number }>} */
  const regions = [];
  /** @type {Array<{ module: string, line: number }>} */
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const marker = matchMarker(lines[i], prefix);
    if (marker && !marker.end) {
      stack.push({ module: marker.module, line: i + 1 });
    } else if (marker) {
      if (stack.length === 0) {
        throw new Error(
          `${filePath}:${String(i + 1)}: end-module:${marker.module} without matching start`,
        );
      }
      const top = stack.pop();
      if (top.module !== marker.module) {
        throw new Error(
          `${filePath}:${String(i + 1)}: end-module:${marker.module} does not match open module:${top.module} at line ${String(top.line)}`,
        );
      }
      regions.push({ module: top.module, startLine: top.line, endLine: i + 1 });
    }
  }
  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1];
    throw new Error(
      `${filePath}:${String(unclosed.line)}: module:${unclosed.module} is not closed by end-module:${unclosed.module}`,
    );
  }
  return regions;
}

const SCAN_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  '__fixtures__',
  'docs',
]);
const SCAN_FILE_RE = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|ya?ml)$|\.env\.example$/;

/** Every real marker line (a whole-line `// @module:x` / `# @module:x` comment) under `root`. */
function findMarkerLines(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SCAN_SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
        continue;
      }
      if (!SCAN_FILE_RE.test(entry.name)) continue;
      const abs = join(dir, entry.name);
      const file = relative(root, abs).replaceAll('\\', '/');
      readFileSync(abs, 'utf8')
        .split(/\r?\n/)
        .forEach((text, i) => {
          const m = matchMarker(text, commentPrefix(file));
          if (m) found.push({ file, line: i + 1, module: m.module });
        });
    }
  };
  walk(root);
  return found;
}

/** Returns the first `requires` cycle between named modules (group refs excluded), or null. */
function findRequiresCycle(modules) {
  const byName = new Map(modules.map((m) => [m.name, m]));
  const visit = (name, path) => {
    if (path.includes(name)) return [...path.slice(path.indexOf(name)), name];
    for (const req of byName.get(name)?.requires ?? []) {
      if (req.startsWith('group:')) continue;
      const cycle = visit(req, [...path, name]);
      if (cycle) return cycle;
    }
    return null;
  };
  for (const m of modules) {
    const cycle = visit(m.name, []);
    if (cycle) return cycle;
  }
  return null;
}

const MARKER_LINE = {
  '#': /^\s*#\s*@(end-)?module:([a-z][a-z0-9-]*)\s*$/,
  '//': /^\s*\/\/\s*@(end-)?module:([a-z][a-z0-9-]*)\s*$/,
  jsx: /^\s*\{\/\*\s*@(end-)?module:([a-z][a-z0-9-]*)\s*\*\/\}\s*$/,
};

/** A whole-line marker → `{ end, module }`, else null. `//` files also accept the JSX comment form. */
function matchMarker(line, prefix) {
  const m =
    line.match(MARKER_LINE[prefix]) ?? (prefix === '//' ? line.match(MARKER_LINE.jsx) : null);
  return m ? { end: Boolean(m[1]), module: m[2] } : null;
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdCheck() {
  const errors = [];
  let manifest;
  try {
    manifest = loadManifest();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  // 1) Schema validation
  try {
    const schema = loadSchema();
    validateSchema(manifest, schema);
  } catch (err) {
    errors.push(err.message);
  }

  const moduleNames = new Set(manifest.modules.map((m) => m.name));

  // 2) Every path exists
  for (const mod of manifest.modules) {
    for (const p of mod.paths) {
      const abs = join(REPO_ROOT, p);
      if (!existsSync(abs)) {
        errors.push(`${mod.name}: path does not exist: ${p}`);
      }
    }
  }

  // 3) Every marker region is balanced and names a known module
  const markerFiles = new Set();
  for (const mod of manifest.modules) {
    for (const f of mod.markers) markerFiles.add(f);
  }
  /** @type {Map<string, Set<string>>} */
  const regionsByFile = new Map();
  for (const f of markerFiles) {
    const abs = join(REPO_ROOT, f);
    if (!existsSync(abs)) {
      errors.push(`marker file does not exist: ${f}`);
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    let regions;
    try {
      regions = parseMarkerRegions(text, f);
    } catch (err) {
      errors.push(err.message);
      continue;
    }
    regionsByFile.set(f, new Set(regions.map((r) => r.module)));
    for (const r of regions) {
      if (!moduleNames.has(r.module)) {
        errors.push(`${f}: unknown module name in marker: ${r.module}`);
      }
    }
  }

  // 4) No orphan markers: every known module that has markers must appear in at
  //    least one marker file, and every marker file region must name a module
  //    that lists the file in its markers[].
  for (const mod of manifest.modules) {
    for (const f of mod.markers) {
      const regions = regionsByFile.get(f);
      if (regions && !regions.has(mod.name)) {
        errors.push(`${f}: module ${mod.name} lists this file in markers but has no region there`);
      }
    }
  }

  // 4b) No orphan markers: a file with real marker lines must be listed in markers[].
  for (const { file, line, module } of findMarkerLines(REPO_ROOT)) {
    if (!markerFiles.has(file)) {
      errors.push(
        `${file}:${String(line)}: marker for ${module} in a file not listed in any module's markers[]`,
      );
    }
  }

  // 5) requires/conflicts: acyclic and satisfiable
  const requiresCycle = findRequiresCycle(manifest.modules);
  if (requiresCycle) errors.push(`requires cycle: ${requiresCycle.join(' -> ')}`);
  for (const mod of manifest.modules) {
    for (const conflict of mod.conflicts) {
      if (!moduleNames.has(conflict)) {
        errors.push(`${mod.name}: conflicts with unknown module "${conflict}"`);
      }
      if (mod.conflicts.includes(conflict)) {
        const other = manifest.modules.find((m) => m.name === conflict);
        if (other && !other.conflicts.includes(mod.name)) {
          errors.push(
            `${mod.name}: conflicts with ${conflict} but ${conflict} does not list the reverse`,
          );
        }
      }
    }
    for (const req of mod.requires) {
      if (req.startsWith('group:')) {
        const group = req.slice('group:'.length);
        const members = manifest.modules.filter((m) => m.group === group);
        if (members.length === 0) {
          errors.push(`${mod.name}: requires group "${group}" but no module belongs to it`);
        }
      } else if (!moduleNames.has(req)) {
        errors.push(`${mod.name}: requires unknown module "${req}"`);
      }
    }
  }

  // 6) Exactly one `db` group module is default
  const dbModules = manifest.modules.filter((m) => m.group === 'db');
  const dbDefaults = dbModules.filter((m) => m.default);
  if (dbDefaults.length !== 1) {
    errors.push(`expected exactly 1 default db-group module, found ${String(dbDefaults.length)}`);
  }

  // 7) The default selection itself satisfies requires/conflicts.
  try {
    validateSelection(
      manifest,
      new Set(manifest.modules.filter((m) => m.default).map((m) => m.name)),
    );
  } catch (err) {
    errors.push(err.message);
  }

  if (errors.length > 0) {
    process.stderr.write(`modules:check failed with ${String(errors.length)} error(s):\n`);
    for (const e of errors) {
      process.stderr.write(`  - ${e}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`modules:check ok (${String(manifest.modules.length)} modules)\n`);
}

function cmdList() {
  const manifest = loadManifest();
  for (const mod of manifest.modules) {
    const def = mod.default ? ' (default)' : '';
    process.stdout.write(`${mod.name} [${mod.kind}/${mod.group}]${def}: ${mod.description}\n`);
  }
}

/**
 * Parses CLI args for `apply`. Returns `{ db, without, dryRun }`.
 */
function parseApplyArgs(argv) {
  let db = null;
  let without = [];
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--db=')) {
      db = arg.slice('--db='.length);
    } else if (arg.startsWith('--without=')) {
      without = arg.slice('--without='.length).split(',').filter(Boolean);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!db) {
    throw new Error('apply requires --db=<mongo|postgres>');
  }
  if (db !== 'mongo' && db !== 'postgres') {
    throw new Error(`--db must be "mongo" or "postgres"; got "${db}"`);
  }
  return { db: `db-${db}`, without, dryRun };
}

/**
 * Resolves the module selection: given the chosen db engine and a list of
 * module names to exclude, returns the set of selected module names.
 */
function resolveSelection(manifest, db, without) {
  const selected = new Set();
  const removed = new Set();
  for (const mod of manifest.modules) {
    if (mod.group === 'db') {
      if (mod.name === db) {
        selected.add(mod.name);
      } else {
        removed.add(mod.name);
      }
    } else if (mod.kind === 'core') {
      selected.add(mod.name);
    } else {
      // optional
      if (without.includes(mod.name)) {
        removed.add(mod.name);
      } else {
        selected.add(mod.name);
      }
    }
  }
  return { selected, removed };
}

/**
 * Validates a selection: conflicts, requires.
 */
function validateSelection(manifest, selected) {
  const errors = [];
  for (const name of selected) {
    const mod = manifest.modules.find((m) => m.name === name);
    if (!mod) continue;
    for (const conflict of mod.conflicts) {
      if (selected.has(conflict)) {
        errors.push(`conflict: ${name} and ${conflict} cannot both be selected`);
      }
    }
    for (const req of mod.requires) {
      if (req.startsWith('group:')) {
        const group = req.slice('group:'.length);
        const members = manifest.modules.filter((m) => m.group === group);
        if (!members.some((m) => selected.has(m.name))) {
          errors.push(`${name} requires a module from group "${group}" but none is selected`);
        }
      } else if (!selected.has(req)) {
        errors.push(`${name} requires ${req} but it is not selected`);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`invalid selection:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

/**
 * Strips marker regions for removed modules from a file, and removes the
 * marker comment lines (but keeps the content) for kept modules.
 * Returns the new text.
 */
function stripMarkers(text, filePath, removedModules, enabledModules = new Set()) {
  const prefix = commentPrefix(filePath);
  const out = [];
  /** Open regions, innermost last: { module, lines } (lines buffered for kept regions). */
  const stack = [];
  const removing = () => stack.some((r) => removedModules.has(r.module));
  for (const line of text.split(/\r?\n/)) {
    const marker = matchMarker(line, prefix);
    if (marker && !marker.end) {
      stack.push({ module: marker.module, lines: [] });
      continue;
    }
    if (marker) {
      const region = stack.pop();
      if (!removing() && !removedModules.has(region.module)) {
        const body = enabledModules.has(region.module)
          ? enableRegion(region.lines, prefix)
          : region.lines;
        (stack.at(-1)?.lines ?? out).push(...body);
      }
      continue;
    }
    if (removing()) continue;
    (stack.at(-1)?.lines ?? out).push(line);
  }
  return out.join('\n');
}

/**
 * Turns a disabled (fully commented-out) region of the selected non-default
 * engine into live code. TS/JS: drops one `//` level from every line. YAML/env:
 * uncomments only `KEY=value` lines so description comments stay comments.
 * A region with any live line is already enabled and is returned unchanged.
 */
function enableRegion(lines, prefix) {
  const live = lines.filter((l) => l.trim() !== '' && !l.trim().startsWith(prefix));
  if (live.length > 0) return lines;
  if (prefix === '#') return lines.map((l) => l.replace(/^(\s*)# ?([A-Z][A-Z0-9_]*=)/, '$1$2'));
  return lines.map((l) => l.replace(/^(\s*)\/\/ ?/, '$1'));
}

/**
 * Removes `keys` from the `field` object (dependencies, devDependencies,
 * scripts, exports) of a package.json. Returns true when the file changed.
 */
function removePackageKeys(pkgJsonPath, field, keys) {
  const text = readFileSync(pkgJsonPath, 'utf8');
  const pkg = JSON.parse(text);
  if (!pkg[field] || !keys.some((k) => Object.hasOwn(pkg[field], k))) return false;
  pkg[field] = Object.fromEntries(Object.entries(pkg[field]).filter(([k]) => !keys.includes(k)));
  writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  return true;
}

/**
 * Resolves a workspace name to its package.json path.
 * Searches the repo tree for a matching `name` field in package.json.
 */
function workspacePackageJson(workspaceName) {
  // Walk common locations first
  const candidates = [
    join(REPO_ROOT, 'apps', 'api', 'package.json'),
    join(REPO_ROOT, 'apps', 'web', 'package.json'),
    join(REPO_ROOT, 'packages', 'contracts', 'package.json'),
    join(REPO_ROOT, 'packages', 'ui', 'package.json'),
    join(REPO_ROOT, 'packages', 'config-typescript', 'package.json'),
    join(REPO_ROOT, 'packages', 'config-eslint', 'package.json'),
    // Flat layout (for tests/fixtures)
    join(REPO_ROOT, 'api', 'package.json'),
    join(REPO_ROOT, 'web', 'package.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const pkg = JSON.parse(readFileSync(p, 'utf8'));
        if (pkg.name === workspaceName) return p;
      } catch {
        // ignore parse errors
      }
    }
  }
  throw new Error(`unknown workspace: ${workspaceName}`);
}

/**
 * Removes compose services from compose.dev.yaml. The file uses YAML markers,
 * so we strip the same way as other marked files. The service block is inside
 * a `@module:<name>` region.
 * Compose services are handled through marker stripping of compose.dev.yaml.
 */

/**
 * Applies a module selection: deletes paths, strips markers, prunes deps/env.
 */
function cmdApply(argv) {
  const args = parseApplyArgs(argv);
  const manifest = loadManifest();
  const { selected, removed } = resolveSelection(manifest, args.db, args.without);
  validateSelection(manifest, selected);

  /** @type {string[]} */
  const actions = [];

  // Build the set of deleted path prefixes (normalized with trailing slash for dirs)
  const deletedPaths = [];
  for (const mod of manifest.modules) {
    if (!removed.has(mod.name)) continue;
    for (const p of mod.paths) {
      deletedPaths.push(p);
    }
  }
  const deletedAbsPrefixes = [];
  for (const p of deletedPaths) {
    const abs = join(REPO_ROOT, p);
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      deletedAbsPrefixes.push(abs.replace(/[/\\]$/, '') + '/');
    } else {
      deletedAbsPrefixes.push(abs);
    }
  }
  function isInsideDeletedPath(absPath) {
    const normalized = absPath.replace(/\\/g, '/');
    for (const prefix of deletedAbsPrefixes) {
      const normPrefix = prefix.replace(/\\/g, '/');
      if (normalized === normPrefix || normalized.startsWith(normPrefix)) {
        return true;
      }
    }
    return false;
  }

  // 1) Delete paths of removed modules
  for (const mod of manifest.modules) {
    if (!removed.has(mod.name)) continue;
    for (const p of mod.paths) {
      const abs = join(REPO_ROOT, p);
      if (!existsSync(abs)) continue;
      if (args.dryRun) {
        actions.push(`DELETE ${p}`);
      } else {
        rmSync(abs, { recursive: true, force: true });
        actions.push(`DELETED ${p}`);
      }
    }
  }

  // 2) Strip marker regions in shared files
  // Collect all marker files across all modules
  const markerFiles = new Set();
  for (const mod of manifest.modules) {
    for (const f of mod.markers) markerFiles.add(f);
  }
  // The selected engine, if it is not the default, ships commented out.
  const enabled = new Set(
    manifest.modules
      .filter((m) => m.group === 'db' && !m.default && selected.has(m.name))
      .map((m) => m.name),
  );
  for (const f of markerFiles) {
    const abs = join(REPO_ROOT, f);
    if (!existsSync(abs)) continue;
    if (isInsideDeletedPath(abs)) continue; // file will be deleted anyway
    const text = readFileSync(abs, 'utf8');
    parseMarkerRegions(text, f); // throws file:line on unbalanced regions before anything is written
    const newText = stripMarkers(text, f, removed, enabled);
    if (newText !== text) {
      if (args.dryRun) {
        actions.push(`STRIP-MARKERS ${f}`);
      } else {
        writeFileSync(abs, newText);
        actions.push(`STRIPPED ${f}`);
      }
    }
  }

  // 3) Prune package.json deps (`<ws>:dev` = devDependencies), scripts and exports
  for (const mod of manifest.modules) {
    if (!removed.has(mod.name)) continue;
    const prunes = [
      ...Object.entries(mod.deps).map(([ws, keys]) =>
        ws.endsWith(':dev')
          ? [ws.slice(0, -':dev'.length), 'devDependencies', keys]
          : [ws, 'dependencies', keys],
      ),
      ...Object.entries(mod.packageScripts ?? {}).map(([ws, keys]) => [ws, 'scripts', keys]),
      ...Object.entries(mod.packageExports ?? {}).map(([ws, keys]) => [ws, 'exports', keys]),
    ];
    for (const [ws, field, keys] of prunes) {
      const pkgJsonPath = workspacePackageJson(ws);
      if (args.dryRun) actions.push(`PRUNE ${ws} ${field}: ${keys.join(', ')}`);
      else if (removePackageKeys(pkgJsonPath, field, keys))
        actions.push(`PRUNED ${ws} ${field}: ${keys.join(', ')}`);
    }
  }

  // 4) Rewrite modules.json to the selected set
  if (args.dryRun) {
    actions.push(`REWRITE modules.json (keep: ${[...selected].join(', ')})`);
  } else {
    const newManifest = {
      modules: manifest.modules
        .filter((m) => selected.has(m.name))
        .map((m) => {
          // Clean up references to removed modules and files
          const cleaned = { ...m };
          // Paths shared with a removed module (e.g. auth/postgres) are gone now.
          cleaned.paths = cleaned.paths.filter((p) => existsSync(join(REPO_ROOT, p)));
          // Remove conflicts with modules that no longer exist
          if (cleaned.conflicts) {
            cleaned.conflicts = cleaned.conflicts.filter((c) => selected.has(c));
          }
          // Remove requires for modules that no longer exist (but keep group: requires)
          if (cleaned.requires) {
            cleaned.requires = cleaned.requires.filter((r) => {
              if (r.startsWith('group:')) return true;
              return selected.has(r);
            });
          }
          // After apply, all marker regions are stripped (for kept modules, the marker
          // comments are removed but content is kept; for removed modules, the entire
          // region is removed). So we clear the markers list.
          cleaned.markers = [];
          return cleaned;
        }),
    };
    // After apply, ensure exactly one db-group module has default: true
    const dbModules = newManifest.modules.filter((m) => m.group === 'db');
    if (dbModules.length === 1 && !dbModules[0].default) {
      dbModules[0].default = true;
    }
    const newPath = join(REPO_ROOT, 'modules.json');
    const newContent = JSON.stringify(newManifest, null, 2) + '\n';
    const currentContent = existsSync(newPath) ? readFileSync(newPath, 'utf8') : '';
    if (newContent !== currentContent) {
      writeFileSync(newPath, newContent);
      actions.push(`REWRITTEN modules.json`);
    }
  }

  // Summary
  process.stdout.write(`\n=== apply ${args.dryRun ? '(dry-run) ' : ''}===\n`);
  process.stdout.write(`Selected: ${[...selected].join(', ')}\n`);
  process.stdout.write(`Removed:  ${[...removed].join(', ')}\n`);
  process.stdout.write(`\nActions (${String(actions.length)}):\n`);
  for (const a of actions) {
    process.stdout.write(`  ${a}\n`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
try {
  switch (command) {
    case 'check':
      cmdCheck();
      break;
    case 'apply':
      cmdApply(rest);
      break;
    case 'list':
      cmdList();
      break;
    default:
      process.stderr.write(
        `Usage: node scripts/modules.mjs <check|apply|list>\n\n` +
          `  check                         Validate modules.json + markers\n` +
          `  apply --db=<mongo|postgres>   Prune unselected modules\n` +
          `        [--without=<a,b>]\n` +
          `        [--dry-run]             Print changes without writing\n` +
          `  list                          Show modules with their status\n`,
      );
      process.exit(1);
  }
} catch (err) {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
}
