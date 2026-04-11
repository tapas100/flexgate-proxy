-- wrk Lua script: ramp concurrency from 1 to N connections
-- over the test duration to find the saturation point.
--
-- Usage:
--   wrk -t4 -c500 -d120s --latency -s ramp.lua http://localhost:8080
--
-- This script starts slow and increases the request rate over time, 
-- producing a latency-vs-throughput curve in the output.

math.randomseed(os.time())

local counter  = 0
local start_ts = nil

-- Ramp schedule: {seconds_elapsed, sleep_ms_between_requests}
-- sleep_ms = 0 means full speed
local ramp = {
  {  0, 50 },   -- 0–10s:  ~20 req/s per connection (warmup)
  { 10, 20 },   -- 10–20s: ~50 req/s
  { 20,  5 },   -- 20–30s: ~200 req/s
  { 30,  1 },   -- 30–40s: ~1000 req/s
  { 40,  0 },   -- 40s+:   full speed
}

init = function(_)
  start_ts = os.clock()
end

delay = function()
  local elapsed = os.clock() - (start_ts or 0)
  local sleep_ms = 0
  for _, r in ipairs(ramp) do
    if elapsed >= r[1] then
      sleep_ms = r[2]
    end
  end
  return sleep_ms
end

request = function()
  counter = counter + 1
  return wrk.format("GET", "/health")
end

done = function(summary, latency, requests)
  io.write("\n── Ramp test summary ──\n")
  io.write(string.format("  Total requests : %d\n", summary.requests))
  io.write(string.format("  Total errors   : %d\n", summary.errors.status +
                                                      summary.errors.connect +
                                                      summary.errors.read +
                                                      summary.errors.write +
                                                      summary.errors.timeout))
  io.write(string.format("  Duration       : %.2f s\n", summary.duration / 1e6))
  io.write(string.format("  Req/s          : %.2f\n", summary.requests / (summary.duration / 1e6)))
  io.write(string.format("  Latency p50    : %.2f ms\n", latency:percentile(50)  / 1e3))
  io.write(string.format("  Latency p95    : %.2f ms\n", latency:percentile(95)  / 1e3))
  io.write(string.format("  Latency p99    : %.2f ms\n", latency:percentile(99)  / 1e3))
  io.write(string.format("  Latency p99.9  : %.2f ms\n", latency:percentile(99.9)/ 1e3))
  io.write(string.format("  Latency max    : %.2f ms\n", latency.max             / 1e3))
end
