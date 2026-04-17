'use strict';
/**
 * commands/doctor.js
 *
 * `flexgate doctor` — inspect the host environment for FlexGate dependencies.
 *
 * Strategy (backend-first with local fallback)
 * ─────────────────────────────────────────────
 *   1. Try GET /api/setup/detect on the admin server (default port 9090).
 *      If it responds, use that report — all probes run server-side with the
 *      same context as FlexGate itself.
 *   2. If the server is not reachable (not started yet, or --local flag),
 *      run every probe in-process via child_process.execFile + net.
 *      This makes the command useful before (and without) a running server.
 *
 * Output (human-readable, default)
 * ──────────────────────────────────
 *   FlexGate Environment Check  (via FlexGate admin API)
 *   ────────────────────────────────────────────────────
 *
 *   Reverse Proxies
 *   ✔  Nginx    installed  v1.24.0
 *   ✖  HAProxy  not found
 *
 *   Container Runtimes
 *   ✔  Docker   installed  v26.1.4
 *   ✖  Podman   not found
 *
 *   Ports
 *   ✔  Port 3000  is free
 *   ⚠  Port 5432  is in use
 *   ✔  Port 6379  is free
 *
 *   ────────────────────────────────────────────────────
 *   2 / 4 tools found  ·  2 / 3 ports free  ·  312 ms
 *
 * Output (--json)
 * ────────────────
 *   Raw JSON from the backend report (or locally-built equivalent).
 *
 * Exit codes
 * ──────────
 *   0  At least one tool found
 *   1  No tools found at all (useful for CI gating)
 */

const { execFile }  = require('child_process');
const net           = require('net');

const log           = require('../lib/logger');
const { defaultClient, resetDefaultClient } = require('../lib/api-client');

// ── constants ─────────────────────────────────────────────────────────────────

const DEFAULT_PORTS = [3000, 5432, 6379];

// Labels for display — keeps the table column widths predictable.
const TOOL_LABELS = {
  nginx:   'Nginx  ',
  haproxy: 'HAProxy',
  docker:  'Docker ',
  podman:  'Podman ',
};

// ── local probe helpers ───────────────────────────────────────────────────────

/**
 * Run a single CLI tool with execFile and extract its version string.
 *
 * @param {string}   cmd      Binary name (looked up on PATH).
 * @param {string[]} args     Arguments to pass (e.g. ['-v']).
 * @param {{re: RegExp, group?: number}[]} patterns
 *   Ordered list of regex patterns tried against combined stdout+stderr.
 *   Returns the first capturing group of the first match.
 * @returns {Promise<{installed:boolean, version?:string, error?:string}>}
 */
function probeTool(cmd, args, patterns) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout, stderr) => {
      const raw = (String(stdout) + String(stderr)).toLowerCase();

      if (!err || raw) {
        // Either success (err === null) or non-zero exit but with output —
        // some tools (nginx -v) exit 1 on version flags yet produce useful text.
        if (raw) {
          for (const { re, group = 1 } of patterns) {
            const m = raw.match(re);
            if (m && m[group]) {
              return resolve({ installed: true, version: m[group] });
            }
          }
          // Ran but no version pattern matched — still counts as installed.
          return resolve({ installed: true });
        }
      }

      // Binary not found or execution failed with no output.
      const msg = err
        ? (err.code === 'ENOENT' ? 'not found' : String(err.message).split('\n')[0])
        : 'not found';
      resolve({ installed: false, error: msg });
    });
  });
}

/**
 * Check whether TCP port on 127.0.0.1 is in use.
 * @param {number} port
 * @returns {Promise<'free'|'in_use'|'unknown'>}
 */
function probePort(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: '127.0.0.1', port });
    const done = (status) => { sock.destroy(); resolve(status); };

    sock.setTimeout(500);
    sock.on('connect',  () => done('in_use'));
    sock.on('timeout',  () => done('unknown'));
    sock.on('error', (e) => done(e.code === 'ECONNREFUSED' ? 'free' : 'unknown'));
  });
}

/**
 * Run all probes locally without contacting the backend.
 * @returns {Promise<object>}  Report in the same shape as the backend JSON.
 */
async function runLocalProbes() {
  const [nginx, haproxy, docker, podman] = await Promise.all([
    probeTool('nginx',   ['-v'],         [{ re: /nginx\/(\S+)/ },         { re: /(\d+\.\d+[\d.]*)/ }]),
    probeTool('haproxy', ['-v'],         [{ re: /haproxy version (\S+)/i }, { re: /(\d+\.\d+[\d.]*)/ }]),
    probeTool('docker',  ['--version'],  [{ re: /docker version ([^,\s]+)/i }, { re: /(\d+\.\d+[\d.]*)/ }]),
    probeTool('podman',  ['--version'],  [{ re: /podman version (\S+)/i }, { re: /(\d+\.\d+[\d.]*)/ }]),
  ]);

  const portStatuses = await Promise.all(DEFAULT_PORTS.map(probePort));
  const ports = {};
  DEFAULT_PORTS.forEach((p, i) => {
    ports[String(p)] = { port: p, status: portStatuses[i] };
  });

  return { nginx, haproxy, docker, podman, ports, detectedAt: new Date().toISOString() };
}

// ── rendering helpers ─────────────────────────────────────────────────────────

/** ANSI: no external deps — replicate what log.js does but inline. */
const IS_TTY   = process.stdout.isTTY;
const NO_COLOR = process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb';
const COLOR    = IS_TTY && !NO_COLOR;

const c = {
  reset:  COLOR ? '\x1b[0m'  : '',
  bold:   COLOR ? '\x1b[1m'  : '',
  dim:    COLOR ? '\x1b[2m'  : '',
  green:  COLOR ? '\x1b[32m' : '',
  yellow: COLOR ? '\x1b[33m' : '',
  red:    COLOR ? '\x1b[31m' : '',
  cyan:   COLOR ? '\x1b[36m' : '',
  blue:   COLOR ? '\x1b[34m' : '',
};

const tick  = `${c.green}${c.bold}✔${c.reset}`;
const cross = `${c.red}${c.bold}✖${c.reset}`;
const warn  = `${c.yellow}${c.bold}⚠${c.reset}`;
const qmark = `${c.dim}?${c.reset}`;

function bold(s)  { return `${c.bold}${s}${c.reset}`; }
function dim(s)   { return `${c.dim}${s}${c.reset}`; }
function cyan(s)  { return `${c.cyan}${s}${c.reset}`; }

/** Section heading. */
function heading(s) {
  process.stdout.write(`\n  ${dim(s)}\n`);
}

/** One tool result line. */
function printTool(key, result) {
  const label = bold((TOOL_LABELS[key] || key).padEnd(7));
  if (result.installed) {
    const ver = result.version ? `  ${dim('v' + result.version)}` : '';
    process.stdout.write(`  ${tick}  ${label}  installed${ver}\n`);
  } else {
    // Only show the error detail when it adds information beyond "not found".
    const detail = result.error && result.error !== 'not found' ? `  ${dim('(' + result.error + ')')}` : '';
    process.stdout.write(`  ${cross}  ${label}  not found${detail}\n`);
  }
}

/** One port result line. */
function printPort(portStr, result) {
  const label = bold(`Port ${portStr}`);
  if (result.status === 'free') {
    process.stdout.write(`  ${tick}  ${label}  is free\n`);
  } else if (result.status === 'in_use') {
    process.stdout.write(`  ${warn}  ${label}  is ${c.yellow}in use${c.reset}\n`);
  } else {
    process.stdout.write(`  ${qmark}  ${label}  ${dim('status unknown')}\n`);
  }
}

/**
 * Render the full report to stdout.
 */
function printReport(report, source, elapsedMs) {
  const sourceLabel = source === 'backend'
    ? dim('(via FlexGate admin API)')
    : dim('(local — admin server not running)');

  const hr = dim('  ' + '─'.repeat(50));

  process.stdout.write(`\n  ${cyan(bold('FlexGate Environment Check'))}  ${sourceLabel}\n`);
  process.stdout.write(`${hr}\n`);

  // ── Reverse proxies ──────────────────────────────────────────────────────
  heading('Reverse Proxies');
  printTool('nginx',   report.nginx   || { installed: false });
  printTool('haproxy', report.haproxy || { installed: false });

  // ── Container runtimes ───────────────────────────────────────────────────
  heading('Container Runtimes');
  printTool('docker', report.docker || { installed: false });
  printTool('podman', report.podman || { installed: false });

  // ── Ports ────────────────────────────────────────────────────────────────
  heading('Ports');
  const portEntries = Object.entries(report.ports || {}).sort(
    ([a], [b]) => parseInt(a, 10) - parseInt(b, 10),
  );
  if (portEntries.length === 0) {
    process.stdout.write(`  ${dim('No port data')}\n`);
  } else {
    portEntries.forEach(([portStr, result]) => printPort(portStr, result));
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  process.stdout.write(`\n${hr}\n`);

  const tools  = [report.nginx, report.haproxy, report.docker, report.podman].filter(Boolean);
  const nOk    = tools.filter(t => t.installed).length;
  const portsOk= portEntries.filter(([, r]) => r.status === 'free').length;

  process.stdout.write(
    `  ${bold(nOk)} / ${tools.length} tools found` +
    `  ·  ${bold(portsOk)} / ${portEntries.length} ports free` +
    `  ·  ${dim(elapsedMs + ' ms')}\n\n`,
  );

  if (nOk === 0) {
    process.stdout.write(
      `  ${warn}  No optional dependencies found.\n` +
      `     ${dim('FlexGate can still run in Benchmark mode without them.')}\n\n`,
    );
  }
}

// ── command registration ──────────────────────────────────────────────────────

/**
 * Register `flexgate doctor` with the given Commander program.
 * @param {import('commander').Command} program
 */
function register(program) {
  program
    .command('doctor')
    .description('Check host environment for FlexGate dependencies')
    .option('--json',               'Output raw JSON report instead of formatted text')
    .option('--local',              'Skip the backend and run probes locally')
    .option(
      '--admin-port <port>',
      'Admin server port to query',
      String(process.env.FLEXGATE_ADMIN_PORT || '9090'),
    )
    .action(async (options) => {
      const start = Date.now();

      let report;
      let source;

      if (options.local) {
        // ── local-only mode ────────────────────────────────────────────────
        if (!options.json) process.stdout.write(dim('  Running local probes…') + '\r');
        report = await runLocalProbes();
        source = 'local';
      } else {
        // ── try backend first ──────────────────────────────────────────────
        if (!options.json) process.stdout.write(dim('  Querying admin server…') + '\r');

        // Temporarily point the client at the requested port if it differs
        // from the default.  resetDefaultClient() clears the singleton so
        // the next call to defaultClient() will pick up env vars fresh.
        const adminPort = parseInt(options.adminPort, 10);
        if (adminPort !== 9090) {
          process.env.FLEXGATE_ADMIN_PORT = String(adminPort);
          resetDefaultClient();
        }

        const result = await defaultClient().get('/api/setup/detect');

        if (result.ok) {
          report = result.data;
          source = 'backend';
        } else {
          // Server not up or returned an error — fall back to local probes.
          if (!options.json) {
            process.stdout.write(dim('  Admin server offline — running local probes…') + '\r');
          }
          report = await runLocalProbes();
          source = 'local';
        }
      }

      const elapsedMs = Date.now() - start;

      // Clear the progress line.
      if (!options.json) process.stdout.write('\r' + ' '.repeat(55) + '\r');

      if (options.json) {
        process.stdout.write(
          JSON.stringify({ ...report, source, elapsedMs }, null, 2) + '\n',
        );
        return;
      }

      printReport(report, source, elapsedMs);

      // Exit 1 when no tools were found — useful for CI scripts.
      const tools = [report.nginx, report.haproxy, report.docker, report.podman].filter(Boolean);
      if (tools.every(t => !t.installed)) {
        process.exitCode = 1;
      }
    });
}

module.exports = { register };
