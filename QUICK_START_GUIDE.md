# FlexGate Quick Start Guide

**Last Updated:** January 27, 2026

---

## 🚀 Resume Development After a Break

### 1. Check Your Current Position
```bash
# See current branch
git branch --show-current

# See all branches
git branch -a

# View recent activity
git log --oneline --graph --decorate -10
```

### 2. Review Planning Documents
- Read `FEATURE_DEVELOPMENT_PLAN.md` - Overall roadmap
- Check `BRANCH_TRACKING.md` - Specific branch status
- Review this file - Quick commands

### 3. Start Working
```bash
# Always start from dev
git checkout dev
git pull origin dev

# Create or switch to feature branch
git checkout feature/[branch-name]

# If starting fresh
git checkout -b feature/[branch-name] dev
```

---

## 📊 Current Project Status

### Completed ✅
- Main branch established
- Dev branch created
- 21 feature branches created
- Planning documents completed

### In Progress 🔄
- Nothing yet - ready to start Phase 0

### Next Immediate Steps 📋
1. Switch to `feature/core-stabilization`
2. Review existing code (`app.js`, `src/`)
3. Begin stabilization tasks

---

## 🌿 Feature Branch Map

### Phase 0 (Weeks 1-2)
- `feature/core-stabilization` - Foundation work

### Phase 1 (Weeks 3-5)
- `feature/architecture-split` - System design

### Phase 2 (Weeks 4-8)
- `feature/flexgate-agent` - Core agent

### Phase 3 (Weeks 6-12)
- `feature/control-plane-api` - API gateway
- `feature/tenant-config` - Multi-tenant config
- `feature/agent-orchestrator` - Agent management

### Phase 4 (Weeks 8-10)
- `feature/config-ux` - Config UI

### Phase 5 (Weeks 10-16)
- `feature/metrics-system` - Prometheus metrics
- `feature/logging-system` - Structured logs
- `feature/pre-aggregation` - AI-ready data

### Phase 6 (Weeks 14-22)
- `feature/llm-infrastructure` - LLM deployment
- `feature/ai-services` - AI analysis
- `feature/prompt-architecture` - Prompt engineering

### Phase 7 (Weeks 18-24)
- `feature/integrations` - Slack, email, etc.
- `feature/message-ux` - Rich messages
- `feature/alert-management` - Alert system

### Phase 8 (Weeks 20-28)
- `feature/incidents-ui` - Incident timeline
- `feature/health-dashboard` - Health view
- `feature/config-editor-ui` - Visual config
- `feature/communication-ui` - Communication hub

### Phase 9 (Weeks 24-30)
- `feature/oss-strategy` - OSS packaging

---

## 🔄 Common Workflows

### Starting a New Feature
```bash
git checkout dev
git pull origin dev
git checkout -b feature/new-feature dev
# Make changes
git add .
git commit -m "feat: description"
git push origin feature/new-feature
```

### Continuing Existing Feature
```bash
git checkout feature/existing-feature
git pull origin feature/existing-feature
# Make changes
git add .
git commit -m "feat: description"
git push origin feature/existing-feature
```

### Merging to Dev
```bash
git checkout dev
git pull origin dev
git merge feature/your-feature
# Resolve conflicts if any
git push origin dev
```

### Creating a Release
```bash
git checkout main
git pull origin main
git merge dev
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin main --tags
```

---

## 📁 Key Files Reference

### Core Application
- `app.js` - Main application entry
- `bin/www` - Server startup
- `package.json` - Dependencies

### Configuration
- `config/proxy.yml` - Proxy configuration
- `src/config/loader.js` - Config loader

### Source Code
- `src/circuitBreaker.js` - Circuit breaker
- `src/rateLimiter.js` - Rate limiting
- `src/logger.js` - Logging

### Documentation
- `README.md` - Project overview
- `FEATURE_DEVELOPMENT_PLAN.md` - Complete roadmap
- `BRANCH_TRACKING.md` - Branch status
- `QUICKSTART.md` - Original quick start
- `docs/` - Technical documentation

---

## 🎯 Development Priorities

### Priority 1: Core Stabilization (Start Here)
- Freeze current proxy features
- Add comprehensive tests
- Version the config schema
- Stabilize APIs

### Priority 2: Agent Architecture
- Design agent structure
- Define communication protocol
- Build POC

### Priority 3: Control Plane MVP
- Basic API
- Config management
- Agent communication

---

## 🛠️ Useful Commands

### Development
```bash
# Install dependencies
npm install

# Run locally
npm start

# Run tests (if available)
npm test

# Check for issues
npm run lint
```

### Docker
```bash
# Build image
docker build -t flexgate-proxy .

# Run container
docker-compose up

# Stop
docker-compose down
```

### Git
```bash
# See what changed
git status

# View uncommitted changes
git diff

# View branch changes
git diff dev..feature/branch-name

# Stash work in progress
git stash save "WIP: description"

# Resume stashed work
git stash pop

# List all stashes
git stash list
```

---

## 📝 Commit Message Convention

Use conventional commits format:

```
feat: Add new feature
fix: Fix bug
docs: Update documentation
refactor: Refactor code
test: Add tests
chore: Maintenance tasks
perf: Performance improvement
```

Examples:
```bash
git commit -m "feat(agent): implement config pull mechanism"
git commit -m "fix(proxy): resolve memory leak in circuit breaker"
git commit -m "docs: update architecture diagrams"
```

---

## 🔍 Finding Your Way

### "Where should I start?"
1. Read `FEATURE_DEVELOPMENT_PLAN.md`
2. Check `BRANCH_TRACKING.md` for status
3. Start with `feature/core-stabilization`

### "What was I working on?"
```bash
# Check recent branches
git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short) - %(committerdate:relative)'

# See recent commits
git log --oneline -20

# Check BRANCH_TRACKING.md for notes
```

### "What needs to be done next?"
- Check the unchecked `[ ]` items in `FEATURE_DEVELOPMENT_PLAN.md`
- Review the "Next Steps" in `BRANCH_TRACKING.md`

---

## 🎓 Learning Resources

### Architecture Understanding
- `docs/architecture.md` - System architecture
- `docs/problem.md` - Problem space
- `docs/trade-offs.md` - Design decisions

### Domain Knowledge
- `PRODUCT.md` - Product vision
- `ROADMAP.md` - Feature roadmap
- `docs/traffic-control.md` - Traffic management

---

## 🚨 Emergency Procedures

### "I'm on the wrong branch!"
```bash
# Stash your changes
git stash save "WIP: accidental work"

# Switch to correct branch
git checkout correct-branch

# Apply stashed changes
git stash pop
```

### "I need to undo my last commit"
```bash
# Keep changes, undo commit
git reset --soft HEAD~1

# Discard changes and commit
git reset --hard HEAD~1
```

### "I have merge conflicts"
```bash
# See conflicting files
git status

# Edit files to resolve conflicts
# Look for <<<<<<< HEAD markers

# Mark as resolved
git add <file>

# Complete merge
git commit
```

---

## 📞 Getting Help

### Documentation
1. Check planning documents in root directory
2. Review `docs/` folder
3. Read inline code comments

### External Resources
- Prometheus docs for metrics
- HAProxy docs for proxy config
- Llama/Qwen docs for AI implementation

---

## ✅ Pre-commit Checklist

Before committing:
- [ ] Code follows project style
- [ ] No console.logs or debug code
- [ ] Comments explain "why" not "what"
- [ ] Update relevant docs if needed
- [ ] Add entry to CHANGELOG.md for significant changes
- [ ] Update BRANCH_TRACKING.md with progress

---

## 🎯 Success Criteria Reminder

You're building:
- ✅ Intelligence layer for API traffic
- ✅ AI that explains failures and predicts risk
- ✅ Best-in-class UX that answers "what's wrong, why, what to do"
- ✅ Customer-owned infrastructure

You're NOT building:
- ❌ Traditional proxy
- ❌ CDN
- ❌ Monitoring clone

---

**Need help?** Check `FEATURE_DEVELOPMENT_PLAN.md` or `BRANCH_TRACKING.md`

**Ready to code?** Run: `git checkout feature/core-stabilization`
