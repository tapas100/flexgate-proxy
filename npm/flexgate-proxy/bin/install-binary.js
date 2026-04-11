#!/usr/bin/env node
// install-binary.js — postinstall hook for @flexgate/proxy
//
// Responsibilities:
//   1. Determine the current OS + arch.
//   2. Find the matching @flexgate/proxy-<os>-<arch> optional package.
//   3. Symlink (or copy on Windows) the binary into this package's bin/ dir
//      so `npx flexgate-proxy` and the `bin` entry work without PATH changes.
//   4. chmod +x the binary on POSIX platforms.
//
// Design principles:
//   - Never throws — failures are warnings; users can fall back to building
//     from source (`make go-build`).
//   - No third-party dependencies — runs with node built-ins only.
//   - Idempotent — safe to run multiple times.

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Platform mapping ──────────────────────────────────────────────────────────
// Maps [process.platform][process.arch] → { pkg, exe }
//   pkg: the optional npm package that contains the binary
//   exe: the binary filename inside that package
const PLATFORMS = {
  linux: {
    x64:   { pkg: '@flexgate/proxy-linux-x64',    exe: 'flexgate-proxy' },
    arm64: { pkg: '@flexgate/proxy-linux-arm64',   exe: 'flexgate-proxy' },
  },
  darwin: {
    x64:   { pkg: '@flexgate/proxy-darwin-x64',   exe: 'flexgate-proxy' },
    arm64: { pkg: '@flexgate/proxy-darwin-arm64',  exe: 'flexgate-proxy' },
  },
  win32: {
    x64:   { pkg: '@flexgate/proxy-win32-x64',    exe: 'flexgate-proxy.exe' },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function warn(msg) {
  process.stderr.write(`[flexgate-proxy] WARN  ${msg}\n`);
}

function info(msg) {
  process.stdout.write(`[flexgate-proxy] INFO  ${msg}\n`);
}

/** Return the absolute path to a package's root, or null if not installed. */
function resolvePackageDir(pkgName) {
  // Walk up from __dirname looking for node_modules/<pkgName>.
  // This handles hoisted installs (npm/yarn workspaces) and local installs.
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'node_modules', pkgName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

/** Ensure a directory exists. */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const platform = process.platform; // 'linux', 'darwin', 'win32', …
  const arch     = process.arch;     // 'x64', 'arm64', …

  const archMap = PLATFORMS[platform];
  if (!archMap) {
    warn(`Unsupported platform "${platform}". Install from source: https://github.com/tapas100/flexgate-proxy`);
    return;
  }

  const entry = archMap[arch];
  if (!entry) {
    warn(`Unsupported architecture "${arch}" on "${platform}". Supported: ${Object.keys(archMap).join(', ')}`);
    return;
  }

  const { pkg, exe } = entry;

  // Locate the optional dependency.
  const pkgDir = resolvePackageDir(pkg);
  if (!pkgDir) {
    // optionalDependencies are allowed to be absent (e.g. network failure, or
    // intentionally excluded via --ignore-optional). This is not a fatal error.
    warn(`Optional package "${pkg}" not found. Binary not available.`);
    warn(`You can install it manually: npm install ${pkg}`);
    warn(`Or build from source: make go-build  (requires Go 1.22+)`);
    return;
  }

  const srcBin  = path.join(pkgDir, 'bin', exe);
  if (!fs.existsSync(srcBin)) {
    warn(`Binary not found inside "${pkg}" at expected path: ${srcBin}`);
    return;
  }

  // Ensure this package's bin/ directory exists.
  const binDir  = path.join(__dirname, '..', 'bin');
  ensureDir(binDir);

  const destBin = path.join(binDir, exe);

  // Remove stale link/file from a previous install.
  if (fs.existsSync(destBin) || fs.existsSync(destBin + '.old')) {
    try { fs.unlinkSync(destBin); } catch (_) { /* ignore */ }
  }

  if (platform === 'win32') {
    // Windows: symlinks require elevated privileges in some configurations;
    // copy the binary instead.
    fs.copyFileSync(srcBin, destBin);
    info(`Binary copied to ${destBin}`);
  } else {
    // POSIX: use a symlink so the binary stays up to date if the package is
    // updated in-place (e.g. npm update).
    fs.symlinkSync(srcBin, destBin);
    // chmod +x on both the symlink target and the dest path.
    try {
      fs.chmodSync(srcBin,  0o755);
      fs.chmodSync(destBin, 0o755);
    } catch (e) {
      warn(`chmod failed (${e.message}) — binary may not be executable`);
    }
    info(`Binary symlinked: ${destBin} → ${srcBin}`);
  }

  info(`flexgate-proxy ${process.platform}/${process.arch} ready.`);
  info(`Run: npx flexgate-proxy --version`);
}

try {
  main();
} catch (err) {
  warn(`Unexpected error during install: ${err.message}`);
  // Never exit non-zero from a postinstall — it would break `npm install` for
  // consumers who don't care about the Go binary.
}
