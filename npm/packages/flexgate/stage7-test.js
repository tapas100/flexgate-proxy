(async () => {
'use strict';
const assert = require('assert');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');

let p=0,f=0;
const ok  = n      => { console.log('  \u2714 '+n); p++; };
const bad = (n,e)  => { console.error('  \u2716 '+n+'\n    '+(e.message||e)); f++; };
const t   = (n,fn) => { try { fn(); ok(n); } catch(e) { bad(n,e); } };
const ta  = async (n,fn) => { try { await fn(); ok(n); } catch(e) { bad(n,e); } };

// ─── lib/api-client.js ───────────────────────────────────────────────────────
console.log('\nlib/api-client.js');
const { ApiClient, createClient, defaultClient, resetDefaultClient } = require('./lib/api-client');

t('ApiClient class exists',         () => assert.strictEqual(typeof ApiClient,         'function'));
t('createClient fn',                () => assert.strictEqual(typeof createClient,      'function'));
t('defaultClient fn',               () => assert.strictEqual(typeof defaultClient,     'function'));
t('resetDefaultClient fn',          () => assert.strictEqual(typeof resetDefaultClient,'function'));
t('defaultClient returns same instance', () => {
  resetDefaultClient();
  const a = defaultClient(); const b = defaultClient();
  assert.strictEqual(a, b);
  resetDefaultClient();
});
t('createClient returns ApiClient', () => assert.ok(createClient() instanceof ApiClient));
t('client has HTTP verbs', () => {
  const c = createClient();
  ['get','post','put','patch','delete','request'].forEach(m =>
    assert.strictEqual(typeof c[m], 'function', m+' missing'));
});

await ta('client.get unreachable port → NETWORK_ERROR', async () => {
  const c = createClient({ adminPort: 19998 });
  const r = await c.get('/api/routes');
  assert.strictEqual(r.ok,   false);
  assert.strictEqual(r.code, 'NETWORK_ERROR');
});

// ── Stub HTTP server ─────────────────────────────────────────────────────────
const ROUTE_DB = [{ id:'1', route_id:'test', path:'/x', upstream:'http://up', enabled:true, methods:[], tags:[] }];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    const url = req.url;
    const method = req.method;
    const json = (status, obj) => {
      res.writeHead(status, {'Content-Type':'application/json'});
      res.end(JSON.stringify(obj));
    };

    if (url === '/api/routes' && method === 'GET') {
      json(200, { routes: ROUTE_DB, total: ROUTE_DB.length });

    } else if (url === '/api/routes' && method === 'POST') {
      const parsed = JSON.parse(body || '{}');
      const hasId = parsed.route_id && parsed.route_id.trim().length > 0;
      if (hasId) {
        const rec = { ...parsed, id: 'new-uuid' };
        ROUTE_DB.push(rec);
        json(201, rec);
      } else {
        json(422, { error: 'route_id required' });
      }

    } else if (url.startsWith('/api/routes/') && method === 'PUT') {
      const id  = decodeURIComponent(url.split('/').pop());
      const idx = ROUTE_DB.findIndex(r => r.id === id);
      const parsed = JSON.parse(body || '{}');
      if (idx >= 0) {
        ROUTE_DB[idx] = { ...ROUTE_DB[idx], ...parsed, id };
        json(200, ROUTE_DB[idx]);
      } else {
        json(404, { error: 'not found' });
      }

    } else if (url.startsWith('/api/routes/') && method === 'DELETE') {
      const id  = decodeURIComponent(url.split('/').pop());
      const idx = ROUTE_DB.findIndex(r => r.id === id);
      if (idx >= 0) {
        ROUTE_DB.splice(idx, 1);
        res.writeHead(204); res.end();
      } else {
        json(404, { error: 'not found' });
      }

    } else if (url === '/api/settings' && method === 'GET') {
      json(200, { log_level:'info', cors_enabled:false, cors_allow_origins:[] });

    } else if (url === '/api/settings' && method === 'PUT') {
      json(200, JSON.parse(body || '{}'));

    } else {
      json(404, { error: 'not found' });
    }
  });
});

await new Promise(r => server.listen(19997, '127.0.0.1', r));
const PORT = 19997;

await ta('client.get 200 → ok:true + routes array', async () => {
  const c = createClient({ adminPort: PORT });
  const r = await c.get('/api/routes');
  assert.strictEqual(r.ok, true);
  assert.ok(Array.isArray(r.data.routes));
});
await ta('client.post 201 → ok:true', async () => {
  const c = createClient({ adminPort: PORT });
  const r = await c.post('/api/routes', { route_id:'a', path:'/a', upstream:'http://a', enabled:true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.route_id, 'a');
});
await ta('client.post 422 → UNPROCESSABLE', async () => {
  const c = createClient({ adminPort: PORT });
  const r = await c.post('/api/routes', { path:'/only' });
  assert.strictEqual(r.ok,   false);
  assert.strictEqual(r.code, 'UNPROCESSABLE');
});
await ta('client.delete 204 → ok:true', async () => {
  const c = createClient({ adminPort: PORT });
  const r = await c.delete('/api/routes/1');
  assert.strictEqual(r.ok, true);
});

// ─── lib/routes-api.js ───────────────────────────────────────────────────────
console.log('\nlib/routes-api.js');
process.env.FLEXGATE_ADMIN_PORT = String(PORT);
resetDefaultClient(); // pick up new FLEXGATE_ADMIN_PORT
const routesApi = require('./lib/routes-api');

t('exports all fns', () => {
  ['listRoutes','getRoute','createRoute','updateRoute','deleteRoute','enableRoute','disableRoute','validateRouteData']
    .forEach(fn => assert.strictEqual(typeof routesApi[fn], 'function', fn+' missing'));
});

t('validateRouteData: missing route_id', () => {
  const e = routesApi.validateRouteData({ path:'/p', upstream:'http://u' });
  assert.ok(typeof e === 'string' && e.length > 0);
});
t('validateRouteData: missing path', () => {
  const e = routesApi.validateRouteData({ route_id:'x', upstream:'http://u' });
  assert.ok(typeof e === 'string');
});
t('validateRouteData: valid → null', () => {
  assert.strictEqual(routesApi.validateRouteData({ route_id:'x', path:'/p', upstream:'http://u' }), null);
});

await ta('listRoutes → routes array', async () => {
  const r = await routesApi.listRoutes();
  assert.strictEqual(r.ok, true);
  assert.ok(Array.isArray(r.data.routes));
});
await ta('getRoute by route_id "a" → found', async () => {
  const r = await routesApi.getRoute('a');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.route_id, 'a');
});
await ta('getRoute unknown → NOT_FOUND', async () => {
  const r = await routesApi.getRoute('no-such');
  assert.strictEqual(r.ok,   false);
  assert.strictEqual(r.code, 'NOT_FOUND');
});
await ta('createRoute validation error', async () => {
  const r = await routesApi.createRoute({ path:'/x', upstream:'http://x' });
  assert.strictEqual(r.ok,   false);
  assert.strictEqual(r.code, 'VALIDATION_ERROR');
});
await ta('createRoute success', async () => {
  const r = await routesApi.createRoute({ route_id:'newroute', path:'/new', upstream:'http://new' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.route_id, 'newroute');
});

// ─── lib/settings-api.js ─────────────────────────────────────────────────────
console.log('\nlib/settings-api.js');
const settingsApi = require('./lib/settings-api');

t('exports all fns', () => {
  ['getSettings','updateSettings','patchSettings','getProxyAdapter','setProxyAdapter']
    .forEach(fn => assert.strictEqual(typeof settingsApi[fn], 'function', fn+' missing'));
});
await ta('getSettings → ok:true', async () => {
  const r = await settingsApi.getSettings({ adminPort: PORT });
  assert.strictEqual(r.ok, true);
  assert.ok('log_level' in r.data);
});
await ta('patchSettings merges + PUTs back', async () => {
  const r = await settingsApi.patchSettings({ log_level:'debug' }, { adminPort: PORT });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.log_level, 'debug');
});
await ta('setProxyAdapter stores type+mode in settings', async () => {
  const r = await settingsApi.setProxyAdapter('nginx', 'inline', { adminPort: PORT });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.proxy_adapter_type, 'nginx');
  assert.strictEqual(r.data.proxy_adapter_mode, 'inline');
});
await ta('updateSettings null → VALIDATION_ERROR', async () => {
  const r = await settingsApi.updateSettings(null);
  assert.strictEqual(r.ok,   false);
  assert.strictEqual(r.code, 'VALIDATION_ERROR');
});

// ─── lib/config-store.js (Stage 7) ───────────────────────────────────────────
console.log('\nlib/config-store.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),'fg7-'));
process.env.FLEXGATE_CONFIG_DIR = tmpDir;
delete require.cache[require.resolve('./lib/config-store')];
const store = require('./lib/config-store');

t('exports readLocalConfig',          () => assert.strictEqual(typeof store.readLocalConfig, 'function'));
t('exports readConnection',           () => assert.strictEqual(typeof store.readConnection,  'function'));
t('exports saveConnection',           () => assert.strictEqual(typeof store.saveConnection,  'function'));
t('does NOT export saveProxyAdapter', () => assert.strictEqual(store.saveProxyAdapter, undefined));
t('does NOT export readProxyAdapter', () => assert.strictEqual(store.readProxyAdapter, undefined));
t('saveConnection + readConnection round-trip', () => {
  store.saveConnection({ port: 9091, host: '10.0.0.1' });
  const c = store.readConnection();
  assert.strictEqual(c.port, 9091);
  assert.strictEqual(c.host, '10.0.0.1');
});

// ─── commands/route.js ───────────────────────────────────────────────────────
// Restore env so api-client doesn't pick up the 10.0.0.1 host from tmpDir
delete process.env.FLEXGATE_CONFIG_DIR;
resetDefaultClient();

console.log('\ncommands/route.js');
const routeCmd = require('./commands/route');

t('exports register', () => assert.strictEqual(typeof routeCmd.register, 'function'));
t('exports all action fns', () => {
  ['actionAdd','actionList','actionShow','actionUpdate','actionRemove','actionEnable','actionDisable']
    .forEach(fn => assert.strictEqual(typeof routeCmd[fn], 'function', fn+' missing'));
});

// register() calls program.command('route') → returns routeObj.
// routeObj.command('list') etc. returns sub-command objects.
// The mock must reflect this two-level structure.
t('register attaches "route" command', () => {
  let topCmd;
  // Factory that builds a full mock command/sub-command
  function makeMock(name) {
    const m = {
      _name: name,
      command(n)        { return makeMock(n); },
      alias()           { return m; },
      description()     { return m; },
      addHelpCommand()  { return m; },
      option()          { return m; },
      action()          { return m; },
    };
    return m;
  }
  const prog = {
    command(n) { topCmd = n; return makeMock(n); },
  };
  routeCmd.register(prog);
  assert.strictEqual(topCmd, 'route');
});

// For route action tests, pass adminPort explicitly so the request goes to
// our stub server and not 9090.
await ta('actionList --json → parseable JSON', async () => {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = c => { out += c; return true; };
  await routeCmd.actionList({ adminPort: PORT, json: true });
  process.stdout.write = orig;
  const parsed = JSON.parse(out);
  assert.ok(Array.isArray(parsed.routes), 'routes must be array');
});
await ta('actionList table output contains route_id', async () => {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = c => { out += c; return true; };
  await routeCmd.actionList({ adminPort: PORT, json: false });
  process.stdout.write = orig;
  assert.ok(out.includes('newroute'), 'route_id "newroute" must appear:\n' + out);
});
await ta('actionAdd /api2 https://ex2.com → creates route', async () => {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = c => { out += c; return true; };
  await routeCmd.actionAdd('/api2', 'https://ex2.com', { adminPort: PORT, json: true });
  process.stdout.write = orig;
  // log.step() also writes progress lines to stdout before the JSON — find the JSON block
  const jsonMatch = out.match(/\{[\s\S]*\}/);
  assert.ok(jsonMatch, 'no JSON object found in output:\n' + out);
  const parsed = JSON.parse(jsonMatch[0]);
  assert.strictEqual(parsed.path, '/api2');
  assert.strictEqual(parsed.route_id, 'api2');
});
await ta('actionShow "newroute" --json returns route', async () => {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = c => { out += c; return true; };
  await routeCmd.actionShow('newroute', { adminPort: PORT, json: true });
  process.stdout.write = orig;
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.route_id, 'newroute');
});
await ta('actionAdd unreachable port throws NETWORK_ERROR', async () => {
  try {
    await routeCmd.actionAdd('/x', 'http://x', { adminPort: 19996, json: false });
    assert.fail('should have thrown');
  } catch(e) {
    assert.ok(e.isRouteApiError, 'must be a RouteApiError');
    assert.strictEqual(e.code, 'NETWORK_ERROR');
  }
});

// ─── lib/index.js ────────────────────────────────────────────────────────────
console.log('\nlib/index.js');
const idx = require('./lib/index');
t('index.apiClient',   () => assert.strictEqual(typeof idx.apiClient,   'object'));
t('index.routesApi',   () => assert.strictEqual(typeof idx.routesApi,   'object'));
t('index.settingsApi', () => assert.strictEqual(typeof idx.settingsApi, 'object'));

// ─── cleanup ─────────────────────────────────────────────────────────────────
server.close();
try { fs.rmSync(tmpDir, { recursive: true }); } catch {}

console.log('\n'+(p+f)+' tests — '+p+' passed, '+f+' failed');
if (f) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
