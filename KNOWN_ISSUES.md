# Known Issues - v0.1.0-beta.1

This document tracks known issues in the beta release that will be addressed before v1.0.0.

## Test Coverage

**Status**: ⚠️ Work in Progress

### Issues

1. **Low Test Coverage** (6% overall)
   - Many modules lack comprehensive test coverage
   - Integration tests need expansion
   - Coverage thresholds temporarily disabled for beta

2. **Failing Test Suites** (4 out of 19)
   - OAuth service tests have authentication issues
   - Log service tests need backend setup
   - Webhook integration tests timing out
   - Some admin UI tests failing

### Action Items

- [ ] Fix OAuth service test authentication
- [ ] Set up proper test database for log service tests
- [ ] Optimize webhook delivery retry logic for tests
- [ ] Increase test coverage to 80%+ (target for v1.0.0)
- [ ] Add more edge case testing
- [ ] Improve test isolation

## CI/CD

**Status**: ⚠️ Needs Improvement

### Issues

1. **Multiple Test Retries**
   - Tests retry multiple times causing long build times
   - Need to configure "fail fast" behavior

2. **Dependabot Configuration**
   - Timezone issues in dependabot.yml (fixed)

### Action Items

- [ ] Configure CI to fail fast on first error
- [ ] Add test timeouts to prevent hanging
- [ ] Optimize CI build times
- [ ] Set up parallel test execution

## Documentation

**Status**: ✅ Complete

- Quick Start guide available
- NPM release plan documented
- API documentation needs expansion (planned for v0.2.0)

## Performance

**Status**: ℹ️ Not Yet Benchmarked

- Performance benchmarks planned for v0.2.0
- Load testing planned for v0.3.0

## Security

**Status**: ✅ Automated Scanning Active

- Dependabot enabled
- CodeQL security scanning active
- Manual security audit planned for v0.9.0

---

## Beta Release Philosophy

This is a **beta release** intended for:
- Early adopter feedback
- Community testing
- Identifying critical issues
- Gathering feature requests

**Not recommended for production use** until v1.0.0.

## Reporting Issues

Please report any issues you find:
- GitHub Issues: https://github.com/tapas100/flexgate-proxy/issues
- Include: Node version, OS, steps to reproduce
- Label with `beta-feedback`

## Roadmap

See [NPM_RELEASE_PLAN.md](./NPM_RELEASE_PLAN.md) for the detailed roadmap to v1.0.0.
