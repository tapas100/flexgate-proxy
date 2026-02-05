# 🤖 GitHub Automation Configuration

This directory contains all GitHub-specific automation, security, and CI/CD configurations.

## 📁 Structure

```
.github/
├── workflows/                    # GitHub Actions workflows
│   ├── ci.yml                   # Main CI pipeline (tests + build)
│   ├── codeql.yml              # CodeQL security scanning
│   └── dependabot-auto-merge.yml # Auto-merge for Dependabot PRs
├── dependabot.yml               # Dependabot configuration
└── SECURITY_AUTOMATION.md       # Security automation documentation
```

## 🔄 Workflows

### `ci.yml` - Continuous Integration
**Triggers**: Push to main/dev, Pull requests
**What it does**:
- Runs backend tests (Node 18.x & 20.x)
- Runs admin UI tests
- Builds TypeScript
- Uploads code coverage
- **Required** for Dependabot auto-merge

### `codeql.yml` - Security Scanning
**Triggers**: Push, PR, Weekly schedule
**What it does**:
- Analyzes JavaScript/TypeScript code
- Detects security vulnerabilities
- Uploads results to Security tab

### `dependabot-auto-merge.yml` - Auto-Merge
**Triggers**: Dependabot PR opened/updated
**What it does**:
- Auto-approves patch/minor updates
- Enables auto-merge after CI passes
- Requires manual review for major updates

## 🛡️ Security Features

1. **Dependabot Alerts** - Automatic vulnerability detection
2. **Dependabot Security Updates** - Auto-PRs for patches
3. **CodeQL Scanning** - Code-level security analysis
4. **Auto-Merge** - Safe, automated dependency updates

## ⚙️ Configuration

### Enable in Repository Settings

1. **Settings → General**
   - ✅ Allow auto-merge

2. **Settings → Security**
   - ✅ Dependabot alerts
   - ✅ Dependabot security updates
   - ✅ Code scanning alerts

3. **Settings → Branches** (Optional - for main branch)
   - Add rule: Require status checks to pass
   - Required checks: `All Checks Passed`

## 🚀 Quick Start

All automation is **pre-configured** and ready to use:

1. Push this configuration to GitHub
2. Enable Dependabot in Settings → Security
3. Workflows will run automatically on next push/PR

## 📊 Monitoring

- **Actions tab**: See workflow runs
- **Security tab**: See CodeQL results & Dependabot alerts
- **Pull requests**: See auto-merge activity

## 🔧 Customization

### Adjust Dependabot schedule
Edit `dependabot.yml` → `schedule.interval`

### Modify CI tests
Edit `workflows/ci.yml` → Add/remove test steps

### Change auto-merge rules
Edit `workflows/dependabot-auto-merge.yml` → Update conditions

---

**Documentation**: See `SECURITY_AUTOMATION.md` for details
