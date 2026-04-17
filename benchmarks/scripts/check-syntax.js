#!/usr/bin/env node
// benchmarks/scripts/check-syntax.js — syntax-check k6 ESM scenario files
const fs = require('fs');
const files = process.argv.slice(2);
let allOk = true;
for (const f of files) {
  try {
    const src = fs.readFileSync(f, 'utf8');
    // Strip multi-line imports (import ... from '...';)
    let clean = src.replace(/^import\s[^;]+;/gm, '');
    // Replace export default function → function _default
    clean = clean.replace(/export\s+default\s+function/g, 'function _default');
    // Replace export const/function/class → const/function/class
    clean = clean.replace(/export\s+(const|function|class)\s+/g, '$1 ');
    // Replace export { ... } lines
    clean = clean.replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
    // Replace k6 globals
    clean = clean.replace(/__ENV/g, '({})');
    clean = clean.replace(/__ITER/g, '0');
    clean = clean.replace(/__VU/g, '1');
    // eslint-disable-next-line no-new-func
    new Function(clean);
    console.log(f + ': OK');
  } catch (e) {
    console.error(f + ': ' + e.message);
    allOk = false;
  }
}
process.exit(allOk ? 0 : 1);
