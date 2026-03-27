# AI Features Testing Checklist

**Quick Reference** | **Version:** 1.0.0 | **Updated:** Feb 15, 2026

---

## 🚀 Quick Start

```bash
# Run all AI tests
npm test -- __tests__/ai/ --coverage

# Expected: 72 tests passing, >95% coverage
```

---

## ✅ Pre-Deployment Checklist

### 1️⃣ Event Factory Tests (39 tests)

- [ ] **Event Creation** - All required fields populated
  ```bash
  npm test -- __tests__/ai/utils/eventFactory.test.ts -t "should create event"
  ```
  - ✅ Event ID format: `evt_<timestamp>_<random>`
  - ✅ Timestamp valid ISO 8601
  - ✅ Type, severity, summary present
  - ✅ Data structure matches event type

- [ ] **Confidence Scoring** - Algorithm accuracy
  ```bash
  npm test -- __tests__/ai/utils/eventFactory.test.ts -t "Confidence"
  ```
  - ✅ High breach (10x) → Confidence >0.85
  - ✅ Low breach (1.1x) → Confidence <0.6
  - ✅ More samples → Higher confidence
  - ✅ Strong trend → Higher confidence

- [ ] **Validation** - Error detection
  ```bash
  npm test -- __tests__/ai/utils/eventFactory.test.ts -t "Validation"
  ```
  - ✅ Missing required fields → Errors array
  - ✅ Missing optional fields → Warnings array
  - ✅ Invalid ranges → Warnings
  - ✅ `isValid` flag accurate

- [ ] **Trend Detection** - Linear regression
  ```bash
  npm test -- __tests__/ai/utils/eventFactory.test.ts -t "Trend"
  ```
  - ✅ Increasing values → RISING
  - ✅ Decreasing values → FALLING
  - ✅ Flat values → STABLE
  - ✅ Correlation coefficient calculated

- [ ] **All 10 Event Types** - Complete coverage
  ```bash
  npm test -- __tests__/ai/utils/eventFactory.test.ts -t "should create"
  ```
  - ✅ CIRCUIT_BREAKER_CANDIDATE
  - ✅ COST_ALERT
  - ✅ LATENCY_ANOMALY
  - ✅ ERROR_RATE_SPIKE
  - ✅ RATE_LIMIT_BREACH
  - ✅ RETRY_STORM
  - ✅ UPSTREAM_DEGRADATION
  - ✅ SECURITY_ANOMALY
  - ✅ CAPACITY_WARNING
  - ✅ RECOVERY_SIGNAL

---

### 2️⃣ Prompt Template Tests (33 tests)

- [ ] **Template Retrieval** - All types covered
  ```bash
  npm test -- __tests__/ai/prompts/templates.test.ts -t "should have templates"
  ```
  - ✅ 10 event types have templates
  - ✅ Each has system_prompt, user_prompt, max_tokens
  - ✅ Coverage validation passes

- [ ] **Variable Substitution** - Correct replacement
  ```bash
  npm test -- __tests__/ai/prompts/templates.test.ts -t "should substitute"
  ```
  - ✅ All `{{variables}}` replaced
  - ✅ No template markers remain
  - ✅ Breach ratio calculated
  - ✅ Samples formatted readably

- [ ] **Token Limits** - Stay under 1000 tokens
  ```bash
  npm test -- __tests__/ai/prompts/templates.test.ts -t "should keep all prompts under"
  ```
  - ✅ All prompts <1000 tokens
  - ✅ Complex events have higher limits
  - ✅ Simple events have lower limits

- [ ] **Cost Estimation** - Accurate pricing
  ```bash
  npm test -- __tests__/ai/prompts/templates.test.ts -t "should estimate costs"
  ```
  - ✅ Cost range: $0.010 - $0.015 per event
  - ✅ Based on Claude 3.5 Sonnet pricing

- [ ] **Template Quality** - Best practices
  ```bash
  npm test -- __tests__/ai/prompts/templates.test.ts -t "Template Quality"
  ```
  - ✅ All request JSON format
  - ✅ All require confidence scores
  - ✅ Response schemas defined
  - ✅ System prompts describe FlexGate

---

### 3️⃣ Integration Tests (Optional - Requires API Key)

- [ ] **Claude API Connection** - Real API calls
  ```bash
  ANTHROPIC_API_KEY=sk-ant-xxx npm test -- __tests__/ai/integration.test.ts
  ```
  - ✅ API responds within 30 seconds
  - ✅ Response is valid JSON
  - ✅ Contains required fields
  - ✅ Confidence score 0-100
  - ✅ Actionable recommendations

- [ ] **All Event Types with Claude** - Complete coverage
  ```bash
  ANTHROPIC_API_KEY=sk-ant-xxx npm test -- __tests__/ai/integration.test.ts -t "All Event Types"
  ```
  - ✅ CIRCUIT_BREAKER_CANDIDATE → root_causes, circuit_breaker_decision
  - ✅ COST_ALERT → anomaly_assessment, strategies, savings
  - ✅ LATENCY_ANOMALY → probable_cause, severity_score
  - ✅ ERROR_RATE_SPIKE → error_category, likely_causes
  - ✅ RATE_LIMIT_BREACH → traffic_type, throttle_recommendation
  - ✅ RETRY_STORM → backpressure_level, mitigation
  - ✅ UPSTREAM_DEGRADATION → degradation_type, failover
  - ✅ SECURITY_ANOMALY → threat_level, attack_type
  - ✅ CAPACITY_WARNING → resource_type, scaling
  - ✅ RECOVERY_SIGNAL → recovery_status, stability

---

### 4️⃣ Performance Tests

- [ ] **Event Creation Speed**
  ```bash
  npm test -- __tests__/ai/utils/eventFactory.test.ts -t "Performance"
  ```
  - ✅ 1000 events in <1 second
  - ✅ Average <1ms per event

- [ ] **Prompt Building Speed**
  ```bash
  npm test -- __tests__/ai/prompts/templates.test.ts -t "Performance"
  ```
  - ✅ 100 prompts in <500ms
  - ✅ Average <5ms per prompt

- [ ] **Claude Response Time** (Integration only)
  - ✅ Analysis completes in <10 seconds
  - ✅ No timeouts under normal conditions

---

### 5️⃣ Edge Cases

- [ ] **Extreme Values**
  ```bash
  npm test -- __tests__/ai/ -t "Edge Cases"
  ```
  - ✅ Very large breach ratios (999x)
  - ✅ Very small breach ratios (1.01x)
  - ✅ Empty samples array
  - ✅ Missing context data
  - ✅ Negative metric values
  - ✅ Zero threshold values

---

## 📊 Coverage Targets

### Overall Coverage
```bash
npm test -- __tests__/ai/ --coverage --coverageReporters=text-summary
```

| Module | Target | Current |
|--------|--------|---------|
| **Event Factory** | >85% | 88.95% ✅ |
| **Prompt Templates** | >95% | 97.43% ✅ |
| **Event Types** | 100% | 100% ✅ |
| **Overall** | >95% | 95.46% ✅ |

---

## 🐛 Common Test Failures

### ❌ "Cannot find module '@flexgate/ai'"
**Fix:**
```bash
npm install
npm run build
```

### ❌ Tests timeout
**Fix:**
```typescript
// In test file
jest.setTimeout(30000); // 30 seconds
```

### ❌ Claude API 401 Unauthorized
**Fix:**
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### ❌ Coverage below target
**Fix:**
```bash
npm test -- __tests__/ai/ --coverage --verbose
# Review uncovered lines and add tests
```

---

## 🔄 Regression Testing

### After Code Changes

```bash
# 1. Run affected tests
npm test -- __tests__/ai/utils/eventFactory.test.ts

# 2. Check coverage didn't drop
npm test -- __tests__/ai/ --coverage

# 3. Run integration tests (if API key available)
ANTHROPIC_API_KEY=xxx npm test -- __tests__/ai/integration.test.ts

# 4. Verify all tests still pass
npm test -- __tests__/ai/
```

### Before Git Commit

```bash
# Pre-commit checklist
npm run lint              # No linting errors
npm run build             # Compiles successfully
npm test -- __tests__/ai/ # All tests pass
git status                # Only intended changes
```

---

## 🚢 Pre-Deployment Checklist

### Required Steps

- [ ] **All unit tests pass** (72 tests)
  ```bash
  npm test -- __tests__/ai/
  ```

- [ ] **Coverage meets targets** (>95%)
  ```bash
  npm test -- __tests__/ai/ --coverage
  ```

- [ ] **No TypeScript errors**
  ```bash
  npm run build
  ```

- [ ] **Integration tests pass** (if API key available)
  ```bash
  ANTHROPIC_API_KEY=xxx npm test -- __tests__/ai/integration.test.ts
  ```

- [ ] **Performance tests pass**
  - Event creation: <1ms per event
  - Prompt building: <5ms per prompt

- [ ] **Edge cases covered**
  - Extreme values
  - Missing data
  - Invalid inputs

### Optional Steps

- [ ] **Load testing** - 1000+ events/minute
- [ ] **Stress testing** - API rate limits
- [ ] **Chaos testing** - Network failures
- [ ] **Security testing** - Input validation

---

## 📈 Continuous Monitoring

### Post-Deployment

```bash
# Monitor test suite health
npm test -- __tests__/ai/ --json > test-results.json

# Track coverage over time
npm test -- __tests__/ai/ --coverage --coverageReporters=json

# Performance benchmarks
npm test -- __tests__/ai/ --verbose | grep "ms"
```

### Weekly Review

- [ ] All tests still passing
- [ ] Coverage hasn't decreased
- [ ] No new warnings
- [ ] Performance within targets

---

## 🎯 Quick Test Commands

### Development
```bash
# Watch mode
npm test -- __tests__/ai/ --watch

# Single test
npm test -- __tests__/ai/utils/eventFactory.test.ts -t "should create event"

# Verbose output
npm test -- __tests__/ai/ --verbose
```

### CI/CD
```bash
# Fast feedback
npm test -- __tests__/ai/ --silent

# Full report
npm test -- __tests__/ai/ --coverage --verbose

# Integration (with retry)
npm test -- __tests__/ai/integration.test.ts --maxWorkers=1 --retry=2
```

### Debugging
```bash
# Show test names
npm test -- __tests__/ai/ --listTests

# Run single file
npm test -- __tests__/ai/utils/eventFactory.test.ts --detectOpenHandles

# Debug mode
node --inspect-brk node_modules/.bin/jest __tests__/ai/
```

---

## 🎓 Test Quality Metrics

### Code Coverage
- **Lines:** >95%
- **Functions:** >95%
- **Branches:** >90%
- **Statements:** >95%

### Test Health
- **Flakiness:** 0% (all tests deterministic)
- **Duration:** <5 seconds (excluding integration)
- **Failures:** 0
- **Warnings:** 0

### Test Pyramid
- **Unit Tests:** 72 (100%)
- **Integration Tests:** 10 (optional)
- **E2E Tests:** 0 (future work)

---

## 📚 Related Documentation

- [Complete Testing Guide](./TESTING_GUIDE.md) - Detailed test flows
- [AI Implementation Plan](../../AI_IMPLEMENTATION_PLAN.md) - Overall roadmap
- [Use Cases](./use-cases.md) - Real-world scenarios
- [Playbooks](./playbooks/) - Operational guides

---

**Quick Start:** `npm test -- __tests__/ai/ --coverage`  
**Expected Result:** ✅ 72 passing, >95% coverage  
**Time:** ~3 seconds
