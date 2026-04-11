#!/usr/bin/env node
// sync-versions.js
//
// Stamps all npm/packages/* package.json and npm/flexgate-proxy/package.json
// with the version passed as the first CLI argument (or the VERSION env var).
//
// Called by CI immediately after the Git tag is resolved:
//   node npm/scripts/sync-versions.js 1.2.3
//
// This ensures every published package has the same version, and the
// optionalDependencies in @flexgate/proxy reference the exact same version.

'use strict';

const fs   = require('fs');
const path = require('path');

const version = process.argv[2] || process.env.VERSION;
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  process.stderr.write(`Usage: node sync-versions.js <semver>\n`);
  process.stderr.write(`Got: ${JSON.stringify(version)}\n`);
  process.exit(1);
}

const root = path.resolve(__dirname, '..');

// All package.json files to update.
const manifests = [
  path.join(root, 'flexgate-proxy', 'package.json'),
  ...['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64'].map(
    p => path.join(root, 'packages', `flexgate-proxy-${p}`, 'package.json')
  ),
];

for (const manifest of manifests) {
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const prev = pkg.version;
  pkg.version = version;

  // Update optionalDependencies in the coordinator package to the same version.
  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) {
      pkg.optionalDependencies[dep] = version;
    }
  }

  fs.writeFileSync(manifest, JSON.stringify(pkg, null, 2) + '\n');
  process.stdout.write(`  ${path.relative(root, manifest)}: ${prev} → ${version}\n`);
}

process.stdout.write(`\nAll packages stamped with version ${version}\n`);
