# Testing Guide

**FlexGate Proxy Testing Documentation**

---

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Test Coverage](#test-coverage)
- [Writing Tests](#writing-tests)
- [CI/CD Integration](#cicd-integration)

---

## Overview

FlexGate uses **Jest** as the testing framework with comprehensive unit and integration tests to ensure code quality and reliability.

### Test Philosophy

- **High Coverage**: Maintain >80% code coverage
- **Fast Execution**: Tests should run quickly
- **Isolation**: Tests should not depend on external services
- **Clarity**: Test names should clearly describe what they test

---

## Test Structure

```
flexgate-proxy/
├── __tests__/              # Integration tests
│   └── app.test.js         # Application-level tests
├── src/
│   ├── config/
│   │   └── __tests__/      # Unit tests for config
│   │       ├── schema.test.js
│   │       └── loader.test.js
│   └── ...
├── tests/
│   └── setup.js            # Global test setup
├── jest.config.json        # Jest configuration
└── package.json            # Test scripts
```

### Test Types

#### Unit Tests
- Located in `src/**/__tests__/`
- Test individual modules in isolation
- Mock external dependencies
- Fast execution

#### Integration Tests
- Located in `__tests__/`
- Test multiple components together
- Test HTTP endpoints
- Verify system behavior

---

## Running Tests

### All Tests

```bash
npm test
```

Runs all tests with coverage reporting.

### Watch Mode

```bash
npm run test:watch
```

Runs tests in watch mode - automatically reruns tests when files change.

### Unit Tests Only

```bash
npm run test:unit
```

Runs only unit tests in `src/` directories.

### Integration Tests Only

```bash
npm run test:integration
```

Runs only integration tests in `__tests__/` directories.

### CI Mode

```bash
npm run test:ci
```

Runs tests in CI environment with optimizations:
- Parallel execution limited to 2 workers
- No watch mode
- CI-specific reporting

### Debug Mode

```bash
npm run test:debug
```

Runs tests with Node.js debugger attached. Use with Chrome DevTools.

---

## Test Coverage

### Coverage Thresholds

Minimum coverage requirements (enforced):

```json
{
  "branches": 80,
  "functions": 80,
  "lines": 80,
  "statements": 80
}
```

### Viewing Coverage

After running `npm test`, open:

```
coverage/lcov-report/index.html
```

### Coverage Reports

Coverage reports are generated in multiple formats:

- **HTML**: `coverage/lcov-report/index.html`
- **LCOV**: `coverage/lcov.info` (for CI tools)
- **Text**: Displayed in terminal
- **JSON**: `coverage/coverage-final.json`

---

## Writing Tests

### Unit Test Example

```javascript
// src/config/__tests__/schema.test.js
const { validateConfig } = require('../schema');

describe('Config Schema', () => {
  test('should validate minimal config', () => {
    const config = {
      upstreams: [{ name: 'test', url: 'https://api.example.com' }],
      routes: [{ path: '/api/*', upstream: 'test' }]
    };

    const result = validateConfig(config);
    expect(result.error).toBeUndefined();
  });
});
```

### Integration Test Example

```javascript
// __tests__/app.test.js
const request = require('supertest');
const app = require('../app');

describe('Health Endpoints', () => {
  test('GET /health should return 200', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('UP');
  });
});
```

### Best Practices

1. **Descriptive Test Names**
   ```javascript
   // Good
   test('should reject config with duplicate upstream names', () => {});
   
   // Bad
   test('test1', () => {});
   ```

2. **Arrange-Act-Assert Pattern**
   ```javascript
   test('example', () => {
     // Arrange: Set up test data
     const config = { ... };
     
     // Act: Execute the code
     const result = validateConfig(config);
     
     // Assert: Verify the outcome
     expect(result.error).toBeUndefined();
   });
   ```

3. **Use beforeEach/afterEach for Setup/Teardown**
   ```javascript
   describe('Feature', () => {
     let mockData;
     
     beforeEach(() => {
       mockData = createMockData();
     });
     
     afterEach(() => {
       jest.clearAllMocks();
     });
     
     test('test case', () => {
       // Test using mockData
     });
   });
   ```

4. **Mock External Dependencies**
   ```javascript
   jest.mock('fs');
   const fs = require('fs');
   
   test('should load file', () => {
     fs.readFileSync.mockReturnValue('mock content');
     // Test code
   });
   ```

5. **Test Edge Cases**
   ```javascript
   describe('Edge Cases', () => {
     test('should handle empty input', () => {});
     test('should handle null values', () => {});
     test('should handle large inputs', () => {});
   });
   ```

---

## Test Utilities

### Global Test Helpers

Available via `global.testHelpers`:

#### waitFor
```javascript
await global.testHelpers.waitFor(() => condition === true, 5000);
```

#### mockRequest
```javascript
const req = global.testHelpers.mockRequest({
  method: 'POST',
  path: '/api/users',
  body: { name: 'John' }
});
```

#### mockResponse
```javascript
const res = global.testHelpers.mockResponse();
res.status(200).json({ success: true });
expect(res.statusCode).toBe(200);
```

---

## Mocking

### Mocking Modules

```javascript
// Mock entire module
jest.mock('redis');

// Mock specific functions
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));
```

### Mocking with Return Values

```javascript
const fs = require('fs');
fs.readFileSync.mockReturnValue('content');
fs.readFileSync.mockReturnValueOnce('first call').mockReturnValue('subsequent calls');
```

### Spy on Methods

```javascript
const spy = jest.spyOn(console, 'log');
// Execute code
expect(spy).toHaveBeenCalledWith('expected message');
spy.mockRestore();
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/sh
npm run lint && npm run test:ci
```

Or use **Husky**:

```bash
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "npm run validate"
```

---

## Debugging Tests

### Run Single Test File

```bash
npx jest src/config/__tests__/schema.test.js
```

### Run Specific Test

```bash
npx jest -t "should validate minimal config"
```

### Debug with Chrome DevTools

1. Run: `npm run test:debug`
2. Open Chrome: `chrome://inspect`
3. Click "inspect" on the Node process
4. Set breakpoints and debug

### Verbose Output

```bash
npx jest --verbose
```

---

## Common Test Patterns

### Testing Async Code

```javascript
test('async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe(expected);
});
```

### Testing Promises

```javascript
test('promise rejection', async () => {
  await expect(failingFunction()).rejects.toThrow('error message');
});
```

### Testing Callbacks

```javascript
test('callback function', (done) => {
  callbackFunction((err, result) => {
    expect(err).toBeNull();
    expect(result).toBe(expected);
    done();
  });
});
```

### Testing Timers

```javascript
jest.useFakeTimers();

test('timer test', () => {
  const callback = jest.fn();
  setTimeout(callback, 1000);
  
  jest.advanceTimersByTime(1000);
  expect(callback).toHaveBeenCalled();
});
```

---

## Test Matchers

### Common Matchers

```javascript
// Equality
expect(value).toBe(expected);
expect(value).toEqual(expected);

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThan(5);
expect(value).toBeCloseTo(0.3);

// Strings
expect(string).toMatch(/pattern/);
expect(string).toContain('substring');

// Arrays
expect(array).toContain(item);
expect(array).toHaveLength(3);

// Objects
expect(obj).toHaveProperty('key');
expect(obj).toMatchObject({ key: 'value' });

// Exceptions
expect(() => fn()).toThrow();
expect(() => fn()).toThrow('error message');

// Functions
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledWith(arg1, arg2);
expect(fn).toHaveBeenCalledTimes(2);
```

---

## Troubleshooting

### Tests Hanging

- Check for missing `done()` in callback tests
- Ensure all promises are resolved/rejected
- Look for open connections (Redis, DB)

### Flaky Tests

- Avoid testing timing-sensitive code without mocking timers
- Mock external services
- Don't depend on execution order

### Low Coverage

- Run with `--coverage` to see uncovered lines
- Focus on critical paths first
- Add edge case tests

---

## Current Test Coverage

As of Phase 0 completion:

### Config Schema Tests
- ✅ 100+ test cases
- ✅ Valid/invalid config validation
- ✅ Upstream validation
- ✅ Route validation
- ✅ Circuit breaker config
- ✅ Rate limit config
- ✅ Migration logic
- ✅ Edge cases

### Config Loader Tests  
- ✅ 30+ test cases
- ✅ YAML loading
- ✅ Validation integration
- ✅ Config reloading
- ✅ Watchers
- ✅ Error handling

### Application Tests
- ✅ 25+ test cases
- ✅ Health endpoints
- ✅ Version endpoint
- ✅ Metrics endpoint
- ✅ Middleware
- ✅ Error handling
- ✅ CORS support

**Total: 150+ test cases**

---

## Next Steps

1. Add tests for circuit breaker module
2. Add tests for rate limiter module
3. Add tests for logger module
4. Set up continuous testing in CI/CD
5. Add performance benchmarks
6. Add load testing

---

**Last Updated:** January 27, 2026  
**Testing Framework:** Jest 29.7.0  
**Coverage Threshold:** 80%
