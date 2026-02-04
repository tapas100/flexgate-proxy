# 🔒 Automated Security & Dependency Management

This repository uses **automated security tools** to keep dependencies updated and vulnerabilities patched with minimal manual intervention.

## 🤖 What's Automated

### ✅ Dependabot
- **Weekly dependency updates** (Mondays at 9 AM)
- **Security patches** (immediate PRs when vulnerabilities found)
- **Grouped updates** to reduce PR noise
- **Auto-merge** for patch/minor updates after CI passes

### 🛡️ CodeQL Security Scanning
- **Automatic code analysis** on every push/PR
- **Weekly scheduled scans** (Mondays)
- Detects:
  - SQL injection
  - XSS vulnerabilities
  - Authentication flaws
  - Unsafe code patterns
  - And 100+ other security issues

### 🧪 Continuous Integration (CI)
- **Backend tests** (Node.js 18.x & 20.x)
- **Admin UI tests** (React + Jest)
- **Build verification** (TypeScript compilation)
- **Code coverage** tracking

## 📋 How It Works

### 1. Vulnerability Detected
```
GitHub Security Advisory → Dependabot Alert → PR Created
```

### 2. Automated Fix
```
Dependabot PR → CI Tests Run → Auto-Approve → Auto-Merge
```

### 3. Manual Review (Major Updates Only)
```
Major Version Update → PR Created → ⚠️ Manual Review Required
```

## 🎯 Update Strategy

| Update Type | Action | Reason |
|------------|--------|---------|
| **Security patches** | ✅ Auto-merge | Critical fixes |
| **Patch updates** (1.0.x) | ✅ Auto-merge | Bug fixes, safe |
| **Minor updates** (1.x.0) | ✅ Auto-merge | New features, backward compatible |
| **Major updates** (x.0.0) | ⚠️ Manual review | Breaking changes possible |

## 🚀 Protected Packages

These packages require **manual review** for major updates:

**Backend:**
- `express` - Core web framework
- `pg` - PostgreSQL client
- `nats` - JetStream messaging

**Frontend:**
- `react` & `react-dom` - UI framework
- `@mui/material` - Component library

## 📊 Security Dashboard

View security status:
- **Dependabot Alerts**: `Settings → Security → Dependabot alerts`
- **Code Scanning**: `Security → Code scanning alerts`
- **Dependency Graph**: `Insights → Dependency graph`

## 🔧 Configuration Files

| File | Purpose |
|------|---------|
| `.github/dependabot.yml` | Dependency update schedule & rules |
| `.github/workflows/ci.yml` | Test & build automation |
| `.github/workflows/dependabot-auto-merge.yml` | Auto-merge logic |
| `.github/workflows/codeql.yml` | Security code scanning |

## 🛠️ Manual Actions (Rare)

### Run security audit locally
```bash
npm audit
npm audit fix
```

### Check for outdated packages
```bash
npm outdated
```

### Update a specific package
```bash
npm update <package-name>
```

## 📈 What Gets Auto-Fixed

✅ **Automatically fixed:**
- Vulnerable dependencies with available patches
- Outdated patch/minor versions
- Security advisories with known fixes

❌ **Requires manual review:**
- Major version updates with breaking changes
- Vulnerabilities without available patches
- Complex dependency conflicts

## 🎓 Best Practices

1. **Review Dependabot PRs weekly** (even auto-merged ones)
2. **Monitor CI failures** - failed auto-merges need attention
3. **Check Security tab** for new advisories
4. **Test locally** before deploying major updates

## 🚨 Emergency Security Fix

If a critical vulnerability is found:

1. Dependabot creates PR **immediately**
2. CI runs tests automatically
3. If tests pass → **auto-merged within minutes**
4. You get a notification after merge

**Average time to patch: < 30 minutes** ⚡

## 📞 Support

- **Dependabot issues**: Check `.github/dependabot.yml`
- **CI failures**: Check `.github/workflows/ci.yml`
- **Security questions**: Check `SECURITY.md`

---

**Last updated**: February 4, 2026
**Maintained by**: @tapas100
