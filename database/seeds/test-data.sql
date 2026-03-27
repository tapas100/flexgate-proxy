-- FlexGate Test Data Seed File
-- Purpose: Populate database with test data for comprehensive testing
-- Usage: psql -U flexgate -d flexgate_proxy -f database/seeds/test-data.sql
-- 
-- This creates:
--   - 5 test routes
--   - 5 test API keys
--   - 5 test webhooks
--   - 30 test AI incidents
--   - ~90 test recommendations
--   - ~30 test outcomes
--   - Sample webhook deliveries

-- Start transaction
BEGIN;

-- ============================================================================
-- CLEANUP EXISTING TEST DATA
-- ============================================================================

DELETE FROM ai_action_outcomes WHERE incident_id LIKE 'evt_seed_%';
DELETE FROM ai_recommendations WHERE incident_id LIKE 'evt_seed_%';
DELETE FROM ai_incidents WHERE incident_id LIKE 'evt_seed_%';
DELETE FROM webhook_deliveries WHERE webhook_id IN (SELECT webhook_id FROM webhooks WHERE name LIKE 'Seed%');
DELETE FROM webhooks WHERE name LIKE 'Seed%';
DELETE FROM api_keys WHERE name LIKE 'Seed%';
DELETE FROM routes WHERE path LIKE '/seed%';

-- ============================================================================
-- TEST ROUTES
-- ============================================================================

INSERT INTO routes (route_id, path, upstream, methods, enabled, timeout, retries, created_at, updated_at) VALUES
(gen_random_uuid(), '/seed-basic', 'httpbin', ARRAY['GET', 'POST'], true, 30000, 3, NOW(), NOW()),
(gen_random_uuid(), '/seed-slow', 'httpbin', ARRAY['GET'], true, 10000, 1, NOW(), NOW()),
(gen_random_uuid(), '/seed-limited', 'httpbin', ARRAY['GET'], true, 30000, 3, NOW(), NOW()),
(gen_random_uuid(), '/seed-auth', 'httpbin', ARRAY['GET', 'POST'], true, 30000, 3, NOW(), NOW()),
(gen_random_uuid(), '/seed-disabled', 'httpbin', ARRAY['GET'], false, 30000, 3, NOW(), NOW());

-- ============================================================================
-- TEST API KEYS
-- ============================================================================

INSERT INTO api_keys (key_id, api_key, name, enabled, created_at, updated_at) VALUES
(gen_random_uuid(), 'seed_' || encode(gen_random_bytes(32), 'hex'), 'Seed Key - Active Admin', true, NOW(), NOW()),
(gen_random_uuid(), 'seed_' || encode(gen_random_bytes(32), 'hex'), 'Seed Key - Active User', true, NOW(), NOW()),
(gen_random_uuid(), 'seed_' || encode(gen_random_bytes(32), 'hex'), 'Seed Key - Read Only', true, NOW(), NOW()),
(gen_random_uuid(), 'seed_' || encode(gen_random_bytes(32), 'hex'), 'Seed Key - Disabled', false, NOW(), NOW()),
(gen_random_uuid(), 'seed_' || encode(gen_random_bytes(32), 'hex'), 'Seed Key - Expired', false, NOW() - INTERVAL '30 days', NOW());

-- ============================================================================
-- TEST WEBHOOKS
-- ============================================================================

INSERT INTO webhooks (webhook_id, name, url, events, enabled, created_at, updated_at) VALUES
(gen_random_uuid(), 'Seed Webhook - All Events', 'https://webhook.site/seed-all', ARRAY['*'], true, NOW(), NOW()),
(gen_random_uuid(), 'Seed Webhook - AI Events', 'https://webhook.site/seed-ai', ARRAY['ai_incident.created', 'ai_incident.resolved'], true, NOW(), NOW()),
(gen_random_uuid(), 'Seed Webhook - Circuit Breaker', 'https://webhook.site/seed-cb', ARRAY['circuit_breaker.opened', 'circuit_breaker.closed'], true, NOW(), NOW()),
(gen_random_uuid(), 'Seed Webhook - Rate Limit', 'https://webhook.site/seed-rl', ARRAY['rate_limit.exceeded'], true, NOW(), NOW()),
(gen_random_uuid(), 'Seed Webhook - Disabled', 'https://webhook.site/seed-disabled', ARRAY['*'], false, NOW(), NOW());

-- ============================================================================
-- TEST AI INCIDENTS
-- ============================================================================

-- Function to generate random incidents
DO $$
DECLARE
  incident_id TEXT;
  recommendation_id TEXT;
  outcome_id TEXT;
  event_types TEXT[] := ARRAY[
    'LATENCY_ANOMALY', 'ERROR_SPIKE', 'MEMORY_LEAK', 'CPU_SPIKE', 
    'TRAFFIC_SURGE', 'DATABASE_SLOW', 'DEPLOYMENT_ISSUE', 'SECURITY_ALERT'
  ];
  severities TEXT[] := ARRAY['CRITICAL', 'WARNING', 'INFO'];
  statuses TEXT[] := ARRAY['OPEN', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE'];
  action_types TEXT[] := ARRAY[
    'RESTART_SERVICE', 'SCALE_UP', 'SCALE_DOWN', 'ADJUST_CONFIG', 
    'ROLLBACK_DEPLOYMENT', 'INVESTIGATE'
  ];
  event_type TEXT;
  severity TEXT;
  status TEXT;
  action_type TEXT;
  detected_at TIMESTAMP;
  resolved_at TIMESTAMP;
  i INT;
  j INT;
BEGIN
  -- Create 30 incidents
  FOR i IN 1..30 LOOP
    incident_id := 'evt_seed_' || lpad(i::TEXT, 5, '0') || '_' || substr(md5(random()::text), 1, 8);
    event_type := event_types[1 + floor(random() * array_length(event_types, 1))::int];
    severity := severities[1 + floor(random() * array_length(severities, 1))::int];
    
    -- Weight statuses toward RESOLVED
    status := CASE 
      WHEN random() < 0.7 THEN 'RESOLVED'
      WHEN random() < 0.15 THEN 'INVESTIGATING'
      WHEN random() < 0.1 THEN 'OPEN'
      ELSE 'FALSE_POSITIVE'
    END;
    
    -- Random date in last 30 days
    detected_at := NOW() - (random() * INTERVAL '30 days');
    resolved_at := CASE 
      WHEN status = 'RESOLVED' THEN detected_at + (random() * INTERVAL '4 hours')
      ELSE NULL
    END;
    
    -- Insert incident
    INSERT INTO ai_incidents (
      incident_id,
      event_id,
      event_type,
      severity,
      summary,
      description,
      detected_at,
      resolved_at,
      status,
      metrics,
      context,
      created_at,
      updated_at
    ) VALUES (
      incident_id,
      'event_' || substr(md5(random()::text), 1, 16),
      event_type,
      severity,
      'Seed test: ' || event_type || ' detected in service',
      'This is a test incident created by the seed file for testing purposes. Event type: ' || event_type,
      detected_at,
      resolved_at,
      status,
      CASE event_type
        WHEN 'LATENCY_ANOMALY' THEN jsonb_build_object(
          'latency_p95', 1000 + random() * 4000,
          'latency_p99', 1500 + random() * 8000,
          'request_rate', 100 + random() * 900
        )
        WHEN 'ERROR_SPIKE' THEN jsonb_build_object(
          'error_rate', random() * 0.3,
          'total_errors', floor(50 + random() * 450),
          'error_types', jsonb_build_array('500', '502', '503')
        )
        WHEN 'MEMORY_LEAK' THEN jsonb_build_object(
          'memory_mb', 1000 + random() * 2500,
          'memory_growth_rate', random() * 0.1
        )
        WHEN 'CPU_SPIKE' THEN jsonb_build_object(
          'cpu_percent', 60 + random() * 39,
          'duration_seconds', 60 + random() * 540
        )
        ELSE jsonb_build_object('value', floor(100 + random() * 900))
      END,
      jsonb_build_object(
        'service', (ARRAY['api-gateway', 'auth-service', 'user-service', 'payment-service'])[1 + floor(random() * 4)::int],
        'endpoint', (ARRAY['/api/users', '/api/orders', '/api/payments', '/api/products'])[1 + floor(random() * 4)::int],
        'region', (ARRAY['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1'])[1 + floor(random() * 4)::int],
        'instance_id', substr(md5(random()::text), 1, 10)
      ),
      detected_at,
      COALESCE(resolved_at, detected_at)
    );
    
    -- Create 3 recommendations per incident
    FOR j IN 1..3 LOOP
      recommendation_id := 'rec_seed_' || lpad(i::TEXT, 5, '0') || '_' || lpad(j::TEXT, 2, '0');
      action_type := action_types[1 + floor(random() * array_length(action_types, 1))::int];
      
      INSERT INTO ai_recommendations (
        recommendation_id,
        incident_id,
        action_type,
        reasoning,
        confidence,
        priority,
        estimated_impact,
        risk_assessment,
        user_decision,
        user_decision_reason,
        actual_action,
        created_at
      ) VALUES (
        recommendation_id,
        incident_id,
        action_type,
        'Test recommendation: ' || action_type || ' based on ' || event_type || ' metrics',
        0.5 + random() * 0.49, -- 0.5 to 0.99
        j,
        'Estimated ' || floor(50 + random() * 50) || '% improvement in ' || 
          (ARRAY['latency', 'error rate', 'memory usage', 'CPU usage', 'throughput'])[1 + floor(random() * 5)::int],
        (ARRAY['Low', 'Medium', 'High'])[1 + floor(random() * 3)::int],
        CASE 
          WHEN random() < 0.6 THEN 'ACCEPTED'
          WHEN random() < 0.8 THEN 'REJECTED'
          ELSE 'MODIFIED'
        END,
        'Test decision for seed data',
        action_type,
        detected_at + (random() * INTERVAL '30 minutes')
      );
    END LOOP;
    
    -- Create outcome for resolved incidents
    IF status = 'RESOLVED' THEN
      outcome_id := 'out_seed_' || lpad(i::TEXT, 5, '0');
      action_type := action_types[1 + floor(random() * array_length(action_types, 1))::int];
      
      INSERT INTO ai_action_outcomes (
        outcome_id,
        incident_id,
        action_type,
        outcome_status,
        improvement_percentage,
        metrics_before,
        metrics_after,
        outcome_notes,
        execution_time_seconds,
        created_at
      ) VALUES (
        outcome_id,
        incident_id,
        action_type,
        CASE WHEN random() < 0.8 THEN 'RESOLVED' ELSE 'PARTIALLY_RESOLVED' END,
        floor(70 + random() * 29), -- 70-99%
        jsonb_build_object('test_metric', floor(1000 + random() * 4000)),
        jsonb_build_object('test_metric', floor(100 + random() * 500)),
        'Test outcome: ' || action_type || ' successfully executed',
        floor(30 + random() * 570), -- 30-600 seconds
        resolved_at
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- TEST WEBHOOK DELIVERIES
-- ============================================================================

-- Create sample webhook deliveries
INSERT INTO webhook_deliveries (
  delivery_id,
  webhook_id,
  event_type,
  payload,
  status_code,
  response_body,
  attempt,
  max_attempts,
  next_retry_at,
  created_at
)
SELECT 
  gen_random_uuid(),
  w.webhook_id,
  (ARRAY[
    'ai_incident.created', 'ai_incident.resolved', 
    'circuit_breaker.opened', 'circuit_breaker.closed',
    'rate_limit.exceeded', 'request.error'
  ])[1 + floor(random() * 6)::int],
  jsonb_build_object(
    'test', true,
    'timestamp', NOW() - (random() * INTERVAL '7 days'),
    'data', jsonb_build_object('value', floor(random() * 1000))
  ),
  (ARRAY[200, 201, 400, 500, 503])[1 + floor(random() * 5)::int],
  'Test response body',
  1,
  3,
  NULL,
  NOW() - (random() * INTERVAL '7 days')
FROM webhooks w
WHERE w.name LIKE 'Seed%'
LIMIT 50;

-- ============================================================================
-- COMMIT AND VERIFY
-- ============================================================================

COMMIT;

-- Display summary
\echo ''
\echo '╔════════════════════════════════════════════════════════════╗'
\echo '║          Test Data Seed Complete                          ║'
\echo '╚════════════════════════════════════════════════════════════╝'
\echo ''
\echo 'Summary:'

SELECT 'Routes' as category, COUNT(*)::text as count FROM routes WHERE path LIKE '/seed%'
UNION ALL
SELECT 'API Keys', COUNT(*)::text FROM api_keys WHERE name LIKE 'Seed%'
UNION ALL
SELECT 'Webhooks', COUNT(*)::text FROM webhooks WHERE name LIKE 'Seed%'
UNION ALL
SELECT 'AI Incidents', COUNT(*)::text FROM ai_incidents WHERE incident_id LIKE 'evt_seed_%'
UNION ALL
SELECT 'AI Recommendations', COUNT(*)::text FROM ai_recommendations WHERE incident_id LIKE 'evt_seed_%'
UNION ALL
SELECT 'AI Action Outcomes', COUNT(*)::text FROM ai_action_outcomes WHERE incident_id LIKE 'evt_seed_%'
UNION ALL
SELECT 'Webhook Deliveries', COUNT(*)::text FROM webhook_deliveries WHERE webhook_id IN (SELECT webhook_id FROM webhooks WHERE name LIKE 'Seed%');

\echo ''
\echo 'Next Steps:'
\echo '  1. View incidents: flexgate ai incidents'
\echo '  2. View routes: flexgate routes list'
\echo '  3. Start testing with PRODUCTION_TESTING_PLAN.md'
\echo ''
\echo 'To clean up:'
\echo '  ./scripts/testing/cleanup-test-data.sh'
\echo ''
