# 📦 NPM Release Plan - FlexGate Proxy

## 🎯 Goal
Make FlexGate installable via `npm install flexgate-proxy` with zero-config startup and progressive customization.

---

## 📋 Release Strategy

### Target Experience
```bash
# Install
npm install flexgate-proxy

# Run with default config
npx flexgate start

# Or programmatically
import { FlexGate } from 'flexgate-proxy';
const gateway = new FlexGate();
await gateway.start();
```

---

## 🏗️ Package Structure

### What Gets Published to NPM

```
flexgate-proxy/
├── dist/                       # Compiled TypeScript
│   ├── app.js                 # Main application
│   ├── bin/
│   │   └── www.js            # CLI entry point
│   ├── src/                  # All compiled source
│   └── *.d.ts                # TypeScript definitions
├── config/
│   └── proxy.yml             # Default configuration
├── migrations/               # Database migrations
│   ├── 001_initial_schema.sql
│   ├── 002_migration_tracking.sql
│   └── 003_requests_table.sql
├── package.json
├── README.md
├── LICENSE
└── CHANGELOG.md
```

### What Gets Excluded (.npmignore)

```
# Source files (users get compiled dist/)
src/
bin/*.ts
app.ts
*.ts
!dist/**/*.d.ts

# Development files
admin-ui/
__tests__/
tests/
test-files-to-copy/
benchmarks/
scripts/
coverage/
logs/
*.log

# Config files
.github/
.vscode/
*.config.js
tsconfig*.json
jest.config.json
.eslintrc*
.prettierrc*

# Documentation (except README)
docs/
*.md
!README.md
!LICENSE
!CHANGELOG.md

# Git files
.git/
.gitignore
.gitattributes
```

---

## 📦 Package.json Updates

### Required Changes

```json
{
  "name": "flexgate-proxy",
  "version": "1.0.0",
  "description": "Production-grade API Gateway with built-in observability, security, and reliability",
  
  "main": "dist/app.js",
  "types": "dist/app.d.ts",
  "bin": {
    "flexgate": "dist/bin/www.js"
  },
  
  "files": [
    "dist/",
    "config/",
    "migrations/",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  
  "scripts": {
    "prepublishOnly": "npm run build && npm test",
    "prepack": "npm run build",
    "postinstall": "node dist/scripts/postinstall.js"
  },
  
  "keywords": [
    "api-gateway",
    "reverse-proxy",
    "microservices",
    "circuit-breaker",
    "rate-limiting",
    "observability",
    "kong-alternative",
    "api-management",
    "proxy",
    "middleware",
    "gateway",
    "flexgate"
  ],
  
  "author": {
    "name": "tapas100",
    "email": "mahanta.tapas9@gmail.com",
    "url": "https://github.com/tapas100"
  },
  
  "repository": {
    "type": "git",
    "url": "git+https://github.com/tapas100/flexgate-proxy.git"
  },
  
  "bugs": {
    "url": "https://github.com/tapas100/flexgate-proxy/issues"
  },
  
  "homepage": "https://github.com/tapas100/flexgate-proxy#readme",
  
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

---

## 🚀 Developer Integration Paths

### Path 1: CLI Usage (Quickest)

```bash
# Install globally
npm install -g flexgate-proxy

# Start with default config
flexgate start

# Start with custom config
flexgate start --config ./my-config.yml

# Generate default config
flexgate init

# Run database migrations
flexgate migrate

# Check status
flexgate status
```

### Path 2: Programmatic Usage (Most Flexible)

```typescript
import { FlexGate } from 'flexgate-proxy';

// Default configuration
const gateway = new FlexGate();
await gateway.start();

// Custom configuration
const gateway = new FlexGate({
  port: 8080,
  upstreams: [
    {
      id: 'api-service',
      target: 'http://localhost:3000',
      routes: ['/api']
    }
  ],
  rateLimiting: {
    enabled: true,
    windowMs: 60000,
    max: 100
  }
});

await gateway.start();
```

### Path 3: Express Middleware (For Existing Apps)

```typescript
import express from 'express';
import { flexgateMiddleware } from 'flexgate-proxy';

const app = express();

// Use FlexGate as middleware
app.use(flexgateMiddleware({
  upstreams: [/* ... */],
  rateLimiting: { enabled: true }
}));

app.listen(3000);
```

### Path 4: Docker Usage

```bash
# Pull from npm-based Docker image
docker pull flexgate/proxy:latest

# Or build from npm package
docker run -p 8080:8080 flexgate/proxy
```

---

## 📚 Required Files to Create

### 1. Post-Install Script
**File**: `scripts/postinstall.ts`
- Welcome message
- Setup instructions
- Config file generation prompt
- Database setup reminder

### 2. CLI Wrapper
**File**: `bin/cli.ts`
- `flexgate start` - Start server
- `flexgate init` - Generate config
- `flexgate migrate` - Run migrations
- `flexgate status` - Health check
- `flexgate --help` - Show help

### 3. Programmatic API
**File**: `src/api/index.ts`
- `FlexGate` class
- `flexgateMiddleware` function
- Configuration types
- Event emitters

### 4. Default Config Generator
**File**: `config/default.yml`
- Sensible defaults
- Commented examples
- Environment variable placeholders

### 5. README for NPM
**File**: `README.md` (NPM version)
- Quick start
- Installation
- Configuration
- Examples
- API reference

---

## 🎓 Documentation Strategy

### Tier 1: Quick Start (README.md)
```markdown
# FlexGate Proxy

## Install
npm install flexgate-proxy

## Quick Start
npx flexgate start

## Features
- ✅ Rate limiting
- ✅ Circuit breaker
- ✅ Observability
- ✅ Zero config
```

### Tier 2: Guides (GitHub Wiki / Website)
- Installation guide
- Configuration guide
- Migration guide
- Deployment guide
- API reference

### Tier 3: Examples (examples/ directory)
- Basic proxy
- Rate limiting
- Circuit breaker
- Custom middleware
- Multi-upstream
- Docker deployment

---

## 🔄 Release Workflow

### Pre-Release Checklist
- [ ] All tests passing
- [ ] TypeScript builds without errors
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped (semantic versioning)
- [ ] Git tags created
- [ ] GitHub release created

### Release Commands
```bash
# 1. Update version
npm version patch  # or minor, or major

# 2. Build for production
npm run build

# 3. Test the package locally
npm pack
npm install -g flexgate-proxy-1.0.0.tgz

# 4. Publish to npm
npm publish --access public

# 5. Create GitHub release
git push origin v1.0.0
gh release create v1.0.0 --notes "Release notes here"
```

### GitHub Actions Automation
Create workflow: `.github/workflows/npm-publish.yml`
- Trigger on tag push (v*)
- Run tests
- Build package
- Publish to npm
- Create GitHub release

---

## 📊 Version Strategy

### Semantic Versioning with Beta Track

**Beta Releases (Testing Phase)**
- **v0.1.0-beta.1**: First public beta
- **v0.1.0-beta.2**: Bug fixes and improvements
- **v0.2.0-beta.1**: New features (backward compatible)
- **v0.3.0-beta.1**: More features

**Release Candidates**
- **v0.9.0-rc.1**: Feature complete, testing
- **v0.9.0-rc.2**: Bug fixes
- **v1.0.0-rc.1**: Final release candidate

**Stable Release**
- **v1.0.0**: First stable release
- **v1.0.x**: Patch updates (bug fixes)
- **v1.x.0**: Minor updates (new features)
- **vx.0.0**: Major updates (breaking changes)

### Beta Release Roadmap

```
Phase 1: Initial Beta (Week 1-2)
├─ v0.1.0-beta.1 - Core features, basic testing
├─ v0.1.0-beta.2 - Critical bug fixes
└─ v0.1.0-beta.3 - Stability improvements

Phase 2: Feature Enhancement (Week 3-4)
├─ v0.2.0-beta.1 - Admin UI improvements
├─ v0.2.0-beta.2 - Better documentation
└─ v0.2.0-beta.3 - Performance optimization

Phase 3: Stabilization (Week 5-6)
├─ v0.3.0-beta.1 - All features complete
├─ v0.3.0-beta.2 - Community feedback
└─ v0.9.0-rc.1   - Release candidate

Phase 4: Release (Week 7-8)
├─ v0.9.0-rc.2   - Final fixes
└─ v1.0.0        - Stable release
```

### Beta Installation

Users can install beta versions:

```bash
# Latest beta
npm install flexgate-proxy@beta

# Specific beta version
npm install flexgate-proxy@0.1.0-beta.1

# Latest (will be stable when available)
npm install flexgate-proxy@latest
```

---

## 🎯 Success Metrics

### Developer Experience Goals
- ⏱️ **< 5 minutes**: From install to running
- 📖 **< 10 minutes**: From install to custom config
- 🔧 **< 30 minutes**: From install to production-ready

### NPM Package Quality
- 📦 Package size < 5 MB
- 📚 TypeScript definitions included
- ✅ 100% API documented
- 🧪 Test coverage > 80%

---

## 🛠️ Implementation Tasks

### Phase 1: Package Preparation (Week 1)
- [ ] Create .npmignore
- [ ] Update package.json
- [ ] Create CLI wrapper
- [ ] Create post-install script
- [ ] Write NPM README

### Phase 2: API Design (Week 2)
- [ ] Design FlexGate class API
- [ ] Create middleware function
- [ ] Add TypeScript types
- [ ] Write API documentation

### Phase 3: Testing (Week 3)
- [ ] Test local installation
- [ ] Test programmatic usage
- [ ] Test CLI commands
- [ ] Test in real projects

### Phase 4: Release (Week 4)
- [ ] Create npm account (if needed)
- [ ] Publish beta version
- [ ] Gather feedback
- [ ] Publish v1.0.0

---

## 📞 Support Strategy

### Documentation
- GitHub README
- npm package README
- GitHub Wiki
- Website (future)

### Community
- GitHub Discussions
- Issue templates
- Contributing guide
- Code of conduct

### Support Channels
- GitHub Issues (bugs)
- GitHub Discussions (questions)
- Stack Overflow tag: `flexgate`

---

## 🚀 Next Steps

1. **Review this plan** - Ensure alignment with goals
2. **Create missing files** - CLI, API, post-install script
3. **Test locally** - Install and use like a real user
4. **Beta release** - Get early feedback
5. **Official release** - Publish v1.0.0

---

**Status**: 📝 Planning Phase
**Target Release**: Week of [DATE]
**Owner**: @tapas100
