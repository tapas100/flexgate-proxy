# Contributing to Proxy Server

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/tapas100/proxy-server/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Logs (with sensitive data redacted)
   - Environment (Node version, OS, config)

### Suggesting Features

1. Open an issue with tag `enhancement`
2. Explain:
   - What problem it solves
   - Why it's better than alternatives
   - How it fits the project scope (see [docs/problem.md](docs/problem.md))

### Pull Requests

#### Before You Start

1. Fork the repository
2. Create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Making Changes

1. **Write tests** for new functionality
2. **Update documentation** if changing behavior
3. **Follow code style**:
   - Run `npm run lint` before committing
   - Use 2 spaces for indentation
   - Add comments for complex logic

4. **Keep commits atomic**:
   - One logical change per commit
   - Write clear commit messages:
     ```
     feat: add HMAC-based authentication
     
     - Implement HMAC-SHA256 signature validation
     - Add middleware for auth checking
     - Update docs/threat-model.md
     ```

#### Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semi colons, etc
- `refactor`: Code restructuring without behavior change
- `test`: Adding tests
- `chore`: Build process or auxiliary tool changes

#### Submitting PR

1. Push to your fork
2. Open PR against `main`
3. Fill out PR template:
   - What does this PR do?
   - Why is it needed?
   - How was it tested?
   - Screenshots/logs (if applicable)

4. Ensure CI passes:
   - All tests pass
   - Linting passes
   - No security vulnerabilities

#### Review Process

- Maintainers will review within 3 business days
- Address feedback
- Once approved, maintainer will merge

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/proxy-server.git
cd proxy-server

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run linter
npm run lint
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
# Start dependencies
docker-compose up -d redis

# Run tests
npm run test:integration
```

### Manual Testing

```bash
# Terminal 1: Start proxy
npm run dev

# Terminal 2: Test requests
curl http://localhost:3000/health/live
curl -H "X-API-Key: test-key" http://localhost:3000/api/test
```

## Documentation

- **Code comments**: Explain *why*, not *what*
- **README**: Keep examples up-to-date
- **docs/**: Update relevant docs when behavior changes
- **Changelog**: Add entry to CHANGELOG.md

## Performance

- Run benchmarks before/after changes:
  ```bash
  npm run benchmark
  ```
- If P95 latency increases > 10%, explain why

## Security

- **Never commit secrets** (API keys, passwords)
- Report security issues privately to: security@example.com
- Don't open public issues for security vulnerabilities

## Release Process

(For maintainers)

1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```
4. GitHub Actions will build and publish

## Questions?

- Open a [Discussion](https://github.com/tapas100/proxy-server/discussions)
- Ask in issues (tag `question`)

## License

By contributing, you agree your contributions will be licensed under the MIT License.
