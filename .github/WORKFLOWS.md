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

All build, test, and publish pipelines run in **Jenkins**. There are two
separate Jenkinsfiles:

| File | Purpose |
|---|---|
| `Jenkinsfile` | TypeScript/Node.js proxy — CI tests + npm publish on `main` |
| `Jenkinsfile.release` | **Go binary release** — cross-compile + npm publish on demand |

---

### `Jenkinsfile` — TypeScript CI pipeline

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

**Trigger:** Push to `main` or merge PR into `main` via GitHub webhook.

---

### `Jenkinsfile.release` — Go binary release pipeline

| Stage | What it does |
|---|---|
| Validate Parameters | Check tag format, verify credentials |
| Checkout | Checkout the exact semver tag |
| Verify Toolchain | Confirm `go` + `node` + `npm` versions |
| Build Binaries | Parallel cross-compile: linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64 |
| Smoke Test | Run native linux/amd64 binary with `--version` |
| Stage npm Binaries | Copy each binary into its `npm/packages/<os>-<arch>/bin/` directory |
| Sync npm Versions | Stamp all six `package.json` files with the release version |
| npm Pack | Pack all packages for inspection; archives tarballs as build artefacts |
| Publish Platform Pkgs | `npm publish` each `@flexgate/proxy-<os>-<arch>` package |
| Publish Coordinator | `npm publish @flexgate/proxy` |
| GitHub Release | `gh release create` + upload binaries as assets (requires `gh-token`) |

**Trigger:** Manual — run the Jenkins job with parameters:
- `RELEASE_TAG` — semver Git tag, e.g. `v1.2.3` (must already exist in remote)
- `DRY_RUN` — when `true`, builds + packs but does **not** publish

**Jenkins job setup (one-time):**
1. New Item → **Pipeline**
2. Definition: **Pipeline script from SCM**
3. Script Path: `Jenkinsfile.release`
4. Tick **"This project is parameterised"**, add:
   - String parameter: `RELEASE_TAG`
   - Boolean parameter: `DRY_RUN` (default `false`)

**Required Jenkins credentials** (Manage Jenkins → Credentials → global):

| ID | Type | Value |
|---|---|---|
| `registry-token` | Secret text | npm automation token from npmjs.com |
| `gh-token` | Secret text | GitHub PAT with `repo` + `write:packages` scope *(optional — skips GitHub Release stage if absent)* |

**Required tools on Jenkins agent:**
- `go 1.22+` on `$PATH`
- `node 20` via NodeJS Plugin (tool name `NodeJS 20`)
- `gh` CLI for GitHub release creation (optional)

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
