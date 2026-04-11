#!/usr/bin/env node
// run.js — entry point for `flexgate-proxy` CLI command and `npx @flexgate/proxy`
//
// This script:
//   1. Locates the platform-native Go binary.
//   2. Spawns it, inheriting stdin/stdout/stderr so it is completely transparent.
//   3. Forwards the process exit code.
//
// Binary resolution order:
//   a. $FLEXGATE_BINARY env var (override for custom builds)
//   b. bin/flexgate-proxy[.exe] in this package (placed by install-binary.js)
//   c. The matching @flexgate/proxy-<os>-<arch> optional package directly
//   d. `flexgate-proxy` / `flexgate-proxy.exe` on PATH
//
// If no binary is found, a clear error is printed with installation instructions.

'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const path = require('path');

const IS_WINDOWS = process.platform === 'win32';
const EXE_NAME   = IS_WINDOWS ? 'flexgate-proxy.exe' : 'flexgate-proxy';

// ── Platform → optional package mapping (must stay in sync with install-binary.js) ──
const PLATFORM_PKGS = {
  'linux-x64':    '@flexgate/proxy-linux-x64',
  'linux-arm64':  '@flexgate/proxy-linux-arm64',
  'darwin-x64':   '@flexgate/proxy-darwin-x64',
  'darwin-arm64': '@flexgate/proxy-darwin-arm64',
  'win32-x64':    '@flexgate/proxy-win32-x64',
};

function resolvePackageDir(pkgName) {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'node_modules', pkgName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findBinary() {
  // a. Explicit override.
  if (process.env.FLEXGATE_BINARY) {
    const override = process.env.FLEXGATE_BINARY;
    if (fs.existsSync(override)) return override;
    process.stderr.write(`[flexgate-proxy] WARN: FLEXGATE_BINARY="${override}" not found, falling back.\n`);
  }

  // b. Symlinked/copied binary in this package's bin/.
  const localBin = path.join(__dirname, EXE_NAME);
  if (fs.existsSync(localBin)) return localBin;

  // c. Optional platform package (direct lookup — handles monorepo hoisting).
  const key = `${process.platform}-${process.arch}`;
  const pkg  = PLATFORM_PKGS[key];
  if (pkg) {
    const pkgDir = resolvePackageDir(pkg);
    if (pkgDir) {
      const pkgBin = path.join(pkgDir, 'bin', EXE_NAME);
      if (fs.existsSync(pkgBin)) return pkgBin;
    }
  }

  // d. PATH lookup.
  try {
    const which = cp.execSync(
      IS_WINDOWS ? `where ${EXE_NAME}` : `which ${EXE_NAME}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim().split('\n')[0].trim();
    if (which && fs.existsSync(which)) return which;
  } catch (_) { /* not on PATH */ }

  return null;
}

function printInstallHelp() {
  const key = `${process.platform}-${process.arch}`;
  process.stderr.write(`
[flexgate-proxy] ERROR: No binary found for ${process.platform}/${process.arch}.

To fix this, try one of:

  1. Re-install the package (downloads the correct binary):
       npm install @flexgate/proxy

  2. Install the platform package directly:
       npm install ${PLATFORM_PKGS[key] || '@flexgate/proxy-<platform>-<arch>'}

  3. Build from source (requires Go 1.22+):
       git clone https://github.com/tapas100/flexgate-proxy
       cd flexgate-proxy && make go-build
       export PATH="$PWD/dist/go:$PATH"

  4. Set FLEXGATE_BINARY to the path of your custom binary:
       FLEXGATE_BINARY=/usr/local/bin/flexgate-proxy flexgate-proxy --version

Supported platforms: ${Object.keys(PLATFORM_PKGS).join(', ')}
`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const binaryPath = findBinary();

if (!binaryPath) {
  printInstallHelp();
  process.exit(1);
}

// Spawn the Go binary, inheriting all stdio so it behaves exactly like a
// native CLI command. Pass all CLI arguments through unchanged.
const child = cp.spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: false, // keep visible on Windows
});

child.on('error', (err) => {
  process.stderr.write(`[flexgate-proxy] Failed to start binary: ${err.message}\n`);
  if (err.code === 'EACCES') {
    process.stderr.write(`[flexgate-proxy] Try: chmod +x ${binaryPath}\n`);
  }
  process.exit(1);
});

child.on('close', (code, signal) => {
  if (signal) {
    // Propagate signal termination correctly on POSIX.
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
