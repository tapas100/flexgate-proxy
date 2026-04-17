'use strict';
/**
 * commands/route.js
 *
 * `flexgate route` — manage proxy routes.
 *
 * Sub-commands
 * ────────────
 *   flexgate route add <path> <upstream>   Create a route
 *   flexgate route list                    List all routes
 *   flexgate route show <id>               Show a single route (by id or route_id)
 *   flexgate route update <id>             Update fields on an existing route
 *   flexgate route remove <id>             Delete a route
 *   flexgate route enable <id>             Set enabled=true
 *   flexgate route disable <id>            Set enabled=false
 *
 * All operations go directly to the backend API — no local state is written.
 *
 * Global options (inherited by all sub-commands)
 * ───────────────────────────────────────────────
 *   -a, --admin-port <n>   Admin API port (default: 9090)
 *   --json                 Output result as JSON (machine-readable)
 *
 * `route add` options
 * ───────────────────
 *   --id <route_id>          Human-readable route ID (default: slug of path)
 *   --methods <m,m,...>      Comma-separated HTTP methods (default: all)
 *   --strip-path <prefix>    Strip prefix before forwarding
 *   --timeout <ms>           Per-request timeout in ms
 *   --description <text>
 *   --tags <t,t,...>
 *   --disabled               Create route with enabled=false
 *
 * `route update` options
 * ──────────────────────
 *   Same as `route add` plus --upstream <url> and --path <path>.
 *
 * Examples
 * ────────
 *   flexgate route add /api https://example.com
 *   flexgate route add /api https://example.com --id my-api --methods GET,POST
 *   flexgate route list
 *   flexgate route list --json
 *   flexgate route show my-api
 *   flexgate route enable my-api
 *   flexgate route disable my-api
 *   flexgate route update my-api --timeout 5000
 *   flexgate route remove my-api
 */

const log       = require('../lib/logger');
const routesApi = require('../lib/routes-api');

// ── Output helpers ────────────────────────────────────────────────────────────

/**
 * Print a single route in the human-readable table format.
 * @param {object} route
 */
function printRoute(route) {
  const enabled = route.enabled ? `${'\x1b[32m'}✔ enabled${'\x1b[0m'}` : `${'\x1b[33m'}✖ disabled${'\x1b[0m'}`;
  const pad     = (s, n) => String(s ?? '').padEnd(n);

  log.br();
  log.detail(`ID         ${route.route_id}`);
  log.detail(`Path       ${route.path}`);
  log.detail(`Upstream   ${route.upstream}`);
  log.detail(`Status     ${enabled}`);
  if (route.methods?.length)      log.detail(`Methods    ${route.methods.join(', ')}`);
  if (route.strip_path)           log.detail(`Strip      ${route.strip_path}`);
  if (route.timeout_ms)           log.detail(`Timeout    ${route.timeout_ms} ms`);
  if (route.description)          log.detail(`Desc       ${route.description}`);
  if (route.tags?.length)         log.detail(`Tags       ${route.tags.join(', ')}`);
  if (route.created_at)           log.detail(`Created    ${route.created_at}`);
  if (route.updated_at)           log.detail(`Updated    ${route.updated_at}`);
  log.br();
}

/**
 * Print a compact routes table.
 * @param {object[]} routes
 */
function printRouteTable(routes) {
  if (!routes.length) {
    log.info('No routes configured.');
    log.detail('Add one with:  flexgate route add <path> <upstream>');
    return;
  }

  const C = {
    bold:   '\x1b[1m',
    dim:    '\x1b[2m',
    cyan:   '\x1b[36m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    reset:  '\x1b[0m',
  };

  // Column widths (dynamic but capped).
  const idW  = Math.min(Math.max(8, ...routes.map(r => (r.route_id  ?? '').length)), 24);
  const pW   = Math.min(Math.max(6, ...routes.map(r => (r.path      ?? '').length)), 32);
  const upW  = Math.min(Math.max(8, ...routes.map(r => (r.upstream  ?? '').length)), 40);

  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const pad   = (s, n) => trunc(String(s ?? ''), n).padEnd(n);

  const header = `${C.bold}${'ROUTE_ID'.padEnd(idW)}  ${'PATH'.padEnd(pW)}  ${'UPSTREAM'.padEnd(upW)}  STATUS${C.reset}`;
  const sep    = `${C.dim}${'-'.repeat(idW + pW + upW + 16)}${C.reset}`;

  process.stdout.write('\n' + header + '\n' + sep + '\n');

  for (const r of routes) {
    const status = r.enabled
      ? `${C.green}● enabled${C.reset}`
      : `${C.yellow}○ disabled${C.reset}`;
    process.stdout.write(
      `${pad(r.route_id, idW)}  ${pad(r.path, pW)}  ${pad(r.upstream, upW)}  ${status}\n`,
    );
  }

  process.stdout.write('\n');
  log.detail(`${routes.length} route${routes.length !== 1 ? 's' : ''} total`);
  log.br();
}

/**
 * Handle a failed API result uniformly across all sub-commands.
 * Throws a RouteApiError so the .action() wrapper (which calls process.exit)
 * is the single place that terminates the process.  This keeps the action
 * functions themselves testable without needing to stub process.exit.
 *
 * @param {object} result
 * @param {string} context  Human-readable description of the operation
 */
function handleError(result, context) {
  let msg;
  switch (result.code) {
    case 'NETWORK_ERROR':
      msg = `${context}: cannot reach the admin API — is FlexGate running? (flexgate start)`;
      break;
    case 'UNAUTHORIZED':
      msg = `${context}: authentication required — set FLEXGATE_ADMIN_USER / FLEXGATE_ADMIN_PASS`;
      break;
    case 'NOT_FOUND':
      msg = `${context}: ${result.error}`;
      break;
    case 'CONFLICT':
      msg = `${context}: a route with that route_id already exists — use a different --id`;
      break;
    case 'UNPROCESSABLE':
      msg = `${context}: validation error — ${result.error}`;
      break;
    default:
      msg = `${context}: ${result.error}`;
  }
  const err = new Error(msg);
  err.code  = result.code;
  err.isRouteApiError = true;
  throw err;
}

// ── Slug helper ───────────────────────────────────────────────────────────────

/** Convert a path like /api/v2/users → api-v2-users */
function slugify(urlPath) {
  return urlPath
    .replace(/^\/+|\/+$/g, '')   // strip leading/trailing slashes
    .replace(/\//g, '-')         // slashes → dashes
    .replace(/[^a-z0-9-_]/gi, '') // strip non-safe chars
    || 'route';
}

// ── Sub-command actions ───────────────────────────────────────────────────────

async function actionAdd(pathArg, upstreamArg, opts) {
  const adminPort = parseInt(opts.adminPort ?? process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const clientOpts = { adminPort };

  const routeData = {
    route_id:    opts.id       || slugify(pathArg),
    path:        pathArg,
    upstream:    upstreamArg,
    enabled:     opts.disabled ? false : true,
    methods:     opts.methods  ? opts.methods.split(',').map(m => m.trim().toUpperCase()) : [],
    strip_path:  opts.stripPath  || '',
    timeout_ms:  opts.timeout    ? parseInt(opts.timeout, 10) : 0,
    description: opts.description || '',
    tags:        opts.tags ? opts.tags.split(',').map(t => t.trim()) : [],
  };

  log.step(1, 2, `Creating route  ${routeData.route_id}  →  ${routeData.upstream}`);

  const result = await routesApi.createRoute(routeData, clientOpts);

  if (!result.ok) return handleError(result, 'route add');

  log.step(2, 2, 'Route created');

  if (opts.json) {
    process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return;
  }

  printRoute(result.data);
}

async function actionList(opts) {
  const adminPort  = parseInt(opts.adminPort ?? process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const clientOpts = { adminPort };

  const result = await routesApi.listRoutes(clientOpts);
  if (!result.ok) return handleError(result, 'route list');

  if (opts.json) {
    process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return;
  }

  printRouteTable(result.data?.routes ?? []);
}

async function actionShow(id, opts) {
  const adminPort  = parseInt(opts.adminPort ?? process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const clientOpts = { adminPort };

  const result = await routesApi.getRoute(id, clientOpts);
  if (!result.ok) return handleError(result, 'route show');

  if (opts.json) {
    process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return;
  }

  printRoute(result.data);
}

async function actionUpdate(id, opts) {
  const adminPort  = parseInt(opts.adminPort ?? process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const clientOpts = { adminPort };

  // Fetch current so we can merge partial changes.
  log.step(1, 3, `Fetching current route "${id}"…`);
  const current = await routesApi.getRoute(id, clientOpts);
  if (!current.ok) return handleError(current, 'route update');

  const merged = { ...current.data };

  if (opts.path)        merged.path        = opts.path;
  if (opts.upstream)    merged.upstream    = opts.upstream;
  if (opts.methods)     merged.methods     = opts.methods.split(',').map(m => m.trim().toUpperCase());
  if (opts.stripPath)   merged.strip_path  = opts.stripPath;
  if (opts.timeout)     merged.timeout_ms  = parseInt(opts.timeout, 10);
  if (opts.description) merged.description = opts.description;
  if (opts.tags)        merged.tags        = opts.tags.split(',').map(t => t.trim());
  if (opts.id)          merged.route_id    = opts.id;

  log.step(2, 3, 'Sending update…');
  const result = await routesApi.updateRoute(current.data.id, merged, clientOpts);
  if (!result.ok) return handleError(result, 'route update');

  log.step(3, 3, 'Route updated');

  if (opts.json) {
    process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
    return;
  }

  printRoute(result.data);
}

async function actionRemove(id, opts) {
  const adminPort  = parseInt(opts.adminPort ?? process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const clientOpts = { adminPort };

  // Resolve to UUID if route_id was given.
  const found = await routesApi.getRoute(id, clientOpts);
  if (!found.ok) return handleError(found, 'route remove');

  const result = await routesApi.deleteRoute(found.data.id, clientOpts);
  if (!result.ok) return handleError(result, 'route remove');

  if (opts.json) {
    process.stdout.write(JSON.stringify({ deleted: true, id: found.data.id }, null, 2) + '\n');
    return;
  }

  log.success(`Route "${id}" deleted`);
}

async function actionEnable(id, opts) {
  const adminPort  = parseInt(opts.adminPort ?? process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const result = await routesApi.enableRoute(id, { adminPort });
  if (!result.ok) return handleError(result, 'route enable');

  if (opts.json) { process.stdout.write(JSON.stringify(result.data, null, 2) + '\n'); return; }
  log.success(`Route "${id}" enabled`);
}

async function actionDisable(id, opts) {
  const adminPort  = parseInt(opts.adminPort ?? process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const result = await routesApi.disableRoute(id, { adminPort });
  if (!result.ok) return handleError(result, 'route disable');

  if (opts.json) { process.stdout.write(JSON.stringify(result.data, null, 2) + '\n'); return; }
  log.success(`Route "${id}" disabled`);
}

// ── Commander registration ────────────────────────────────────────────────────

/**
 * Attach `flexgate route` sub-command tree to a commander Program.
 * @param {import('commander').Command} program
 */
function register(program) {
  const route = program
    .command('route')
    .description('Manage FlexGate proxy routes')
    .addHelpCommand(false);

  // Shared options function.
  const withShared = (cmd) =>
    cmd
      .option('-a, --admin-port <n>', 'Admin API port', '9090')
      .option('--json',               'Output result as JSON');

  // ── route add ────────────────────────────────────────────────────────────
  withShared(
    route
      .command('add <path> <upstream>')
      .description('Create a new route  (e.g. flexgate route add /api https://example.com)')
      .option('--id <route_id>',         'Human-readable route identifier (default: slug of path)')
      .option('--methods <m,m,...>',      'Allowed HTTP methods (default: all)')
      .option('--strip-path <prefix>',   'Strip this prefix before forwarding')
      .option('--timeout <ms>',          'Per-request timeout in milliseconds')
      .option('--description <text>',    'Route description')
      .option('--tags <t,t,...>',         'Comma-separated tags')
      .option('--disabled',              'Create the route in disabled state'),
  ).action((pathArg, upstreamArg, opts) => {
    actionAdd(pathArg, upstreamArg, opts).catch(e => { log.error(e.message); process.exit(1); });
  });

  // ── route list ───────────────────────────────────────────────────────────
  withShared(
    route
      .command('list')
      .alias('ls')
      .description('List all routes'),
  ).action((opts) => {
    actionList(opts).catch(e => { log.error(e.message); process.exit(1); });
  });

  // ── route show ───────────────────────────────────────────────────────────
  withShared(
    route
      .command('show <id>')
      .description('Show details for a route (by route_id or internal UUID)'),
  ).action((id, opts) => {
    actionShow(id, opts).catch(e => { log.error(e.message); process.exit(1); });
  });

  // ── route update ─────────────────────────────────────────────────────────
  withShared(
    route
      .command('update <id>')
      .description('Update fields on an existing route')
      .option('--path <path>',           'New path prefix')
      .option('--upstream <url>',        'New upstream URL')
      .option('--id <route_id>',         'Rename route_id')
      .option('--methods <m,m,...>',      'New method list')
      .option('--strip-path <prefix>',   'New strip-path prefix')
      .option('--timeout <ms>',          'New timeout (ms)')
      .option('--description <text>',    'New description')
      .option('--tags <t,t,...>',         'New tag list'),
  ).action((id, opts) => {
    actionUpdate(id, opts).catch(e => { log.error(e.message); process.exit(1); });
  });

  // ── route remove ─────────────────────────────────────────────────────────
  withShared(
    route
      .command('remove <id>')
      .alias('rm')
      .alias('delete')
      .description('Delete a route (soft-delete)'),
  ).action((id, opts) => {
    actionRemove(id, opts).catch(e => { log.error(e.message); process.exit(1); });
  });

  // ── route enable ─────────────────────────────────────────────────────────
  withShared(
    route
      .command('enable <id>')
      .description('Enable a disabled route'),
  ).action((id, opts) => {
    actionEnable(id, opts).catch(e => { log.error(e.message); process.exit(1); });
  });

  // ── route disable ────────────────────────────────────────────────────────
  withShared(
    route
      .command('disable <id>')
      .description('Disable a route without deleting it'),
  ).action((id, opts) => {
    actionDisable(id, opts).catch(e => { log.error(e.message); process.exit(1); });
  });
}

module.exports = {
  register,
  // export individual actions for testing
  actionAdd,
  actionList,
  actionShow,
  actionUpdate,
  actionRemove,
  actionEnable,
  actionDisable,
};
