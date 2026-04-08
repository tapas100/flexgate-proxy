# 🤖 GitHub Repository Configuration

This directory contains GitHub-specific configuration (Dependabot dependency updates).

> **CI/CD has moved to Jenkins.** See `Jenkinsfile` in the repo root.

## 📁 Structure

```
.github/
├── dependabot.yml               # Dependabot dependency-update config
├── WORKFLOWS.md                 # This file
└── SECURITY_AUTOMATION.md       # Security automation documentation
```

## 🔄 CI/CD — Jenkins (not GitHub Actions)

All build, test, and npm publish pipelines run in **Jenkins** via the `Jenkinsfile`
at the repository root.

| Stage | What it does |
|---|---|
| Checkout | Checks out the branch/commit |
| Setup Node.js | Verifies Node & npm versions |
| Install Dependencies | `npm ci` |
| Lint | `npm run lint` |
| Type Check | `npm run typecheck` |
| Test | `npm run test:ci` with coverage report |
| Build | `npm run build` (TypeScript → dist/) |
| Build Admin UI | `cd admin-ui && npm ci && npm run build` |
| **Publish to npm** | `npm publish` + `npm dist-tag add ... latest` **(main branch only)** |

### Trigger
- **Push to `main`** — full pipeline including npm publish
- **Merge PR into `main`** — same as above via GitHub webhook

### Jenkins Setup (one-time)
1. Add an **npm token** as a Jenkins credential with ID `NPM_TOKEN`
2. Install the [NodeJS Plugin](https://plugins.jenkins.io/nodejs/) on Jenkins
3. Install the [GitHub Plugin](https://plugins.jenkins.io/github/) for webhook trigger
4. Create a Pipeline job pointing to this repo — Jenkins auto-discovers the `Jenkinsfile`

## �️ Dependabot (still active)

Dependabot still opens PRs for dependency updates weekly — **human review is required**
before merging (no auto-merge workflow).

See `dependabot.yml` for configuration.

## 📊 Monitoring

- **Jenkins**: See pipeline runs in your Jenkins instance
- **npm**: https://www.npmjs.com/package/flexgate-proxy
- **GitHub Security tab**: Dependabot alerts

---

**Last Updated:** April 8, 2026
