-- wrk Lua script: simulate production traffic mix for FlexGate
--
-- Usage:
--   wrk -t4 -c200 -d60s --latency -s traffic-mix.lua http://localhost:8080
--
-- Traffic distribution (configurable below):
--   70% GET  /api/items         (read — cache-friendly)
--   15% POST /api/items         (write — with JSON body)
--    5% PUT  /api/items/{id}    (update)
--    5% DELETE /api/items/{id}  (delete)
--    4% GET  /health            (health check — simulates LB probes)
--    1% GET  /metrics           (Prometheus scrape — simulates monitoring)

math.randomseed(os.time())

-- Build a weighted method table (100 slots)
local slots = {}
local i = 1

-- 70 × GET /api/items
for _ = 1, 70 do
  slots[i] = { method = "GET",    path = "/api/items",       body = nil }
  i = i + 1
end
-- 15 × POST /api/items
for _ = 1, 15 do
  slots[i] = {
    method = "POST", path = "/api/items",
    body   = '{"name":"loadtest-item","value":42}',
  }
  i = i + 1
end
-- 5 × PUT /api/items/1
for _ = 1, 5 do
  slots[i] = {
    method = "PUT", path = "/api/items/1",
    body   = '{"name":"loadtest-item-updated","value":99}',
  }
  i = i + 1
end
-- 5 × DELETE /api/items/1
for _ = 1, 5 do
  slots[i] = { method = "DELETE", path = "/api/items/1", body = nil }
  i = i + 1
end
-- 4 × GET /health
for _ = 1, 4 do
  slots[i] = { method = "GET", path = "/health", body = nil }
  i = i + 1
end
-- 1 × GET /metrics
slots[i] = { method = "GET", path = "/metrics", body = nil }

-- Randomise request on every call
request = function()
  local s = slots[math.random(1, 100)]
  if s.body then
    wrk.method  = s.method
    wrk.body    = s.body
    wrk.headers["Content-Type"] = "application/json"
  else
    wrk.method  = s.method
    wrk.body    = nil
    wrk.headers["Content-Type"] = nil
  end
  return wrk.format(nil, s.path)
end

-- Print per-request errors to stdout for debugging
response = function(status, headers, body)
  if status >= 500 then
    io.write(string.format("ERROR %d: %s\n", status, body or ""))
  end
end
