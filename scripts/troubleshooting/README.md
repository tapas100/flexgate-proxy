# FlexGate Troubleshooting Scripts

This directory contains automated scripts to diagnose and fix common FlexGate installation and runtime issues.

## Available Scripts

### 🔍 check-requirements.sh
**Pre-installation system requirements check**

Checks:
- Node.js version (>= 16.x)
- npm installation
- Podman/Docker availability
- Port availability (3000, 3001, 5432, 6379, 8080, 9090)
- Disk space
- Available memory

**Usage:**
```bash
./scripts/troubleshooting/check-requirements.sh
```

**When to use:**
- Before installing FlexGate
- After system upgrades
- When troubleshooting installation failures

---

### 🏥 health-check.sh
**Comprehensive health check of all FlexGate services**

Checks:
- FlexGate API health endpoint
- PostgreSQL container and connectivity
- Redis container and connectivity
- HAProxy stats (production mode)
- Prometheus availability
- Grafana availability
- Admin UI build status
- Error logs

**Usage:**
```bash
./scripts/troubleshooting/health-check.sh
```

**When to use:**
- After starting FlexGate
- When debugging connectivity issues
- As part of monitoring/alerting
- Before deploying updates

**Exit codes:**
- `0` - All critical services healthy
- `1` - One or more services failed

---

### 🧹 clean-install.sh
**Complete clean installation (preserves data volumes)**

Actions:
1. Stops all FlexGate services
2. Removes old containers (keeps volumes)
3. Removes node_modules
4. Removes build artifacts
5. Cleans npm cache
6. Reinstalls dependencies
7. Rebuilds FlexGate
8. Rebuilds Admin UI
9. Starts database services
10. Runs migrations

**Usage:**
```bash
./scripts/troubleshooting/clean-install.sh
```

**When to use:**
- After failed npm updates
- When dependencies are corrupted
- After merging major changes
- When build errors persist

**Note:** Database data is preserved in volumes.

---

### 🔧 auto-recover.sh
**Automatic recovery of failed services**

Checks and fixes:
- PostgreSQL container (restarts if down/unresponsive)
- Redis container (restarts if down/unresponsive)
- FlexGate API process (kills and restarts if unresponsive)
- Database connectivity verification

**Usage:**
```bash
./scripts/troubleshooting/auto-recover.sh
```

**When to use:**
- After system crashes
- When services are unresponsive
- As part of automated monitoring
- Quick recovery without data loss

**Use cases:**
- Development: Quick restart after laptop sleep
- Production: First-line automated recovery
- CI/CD: Pre-deployment health restoration

---

### ☢️ nuclear-reset.sh
**Complete reset - DESTROYS ALL DATA**

⚠️ **WARNING:** This deletes:
- All containers
- All volumes (DATABASE DATA)
- All node_modules
- All build artifacts
- All logs

**Usage:**
```bash
./scripts/troubleshooting/nuclear-reset.sh
```

**Safety features:**
- Requires typing "DELETE EVERYTHING" to confirm
- 5-second countdown
- Can be cancelled with Ctrl+C

**When to use:**
- Completely corrupted installation
- Starting from scratch
- After major version upgrades
- Development environment cleanup

**After reset:**
```bash
npm install
npm run build
npm run db:start
npm run db:migrate
npm start
```

Or use `clean-install.sh` to automate the reinstall.

---

## Usage Workflow

### For New Installations

```bash
# 1. Check system requirements
./scripts/troubleshooting/check-requirements.sh

# 2. If checks pass, install
npm install
npm run build

# 3. Verify health
./scripts/troubleshooting/health-check.sh
```

---

### For Installation Failures

```bash
# 1. Try clean install first
./scripts/troubleshooting/clean-install.sh

# 2. If that fails, check requirements
./scripts/troubleshooting/check-requirements.sh

# 3. Fix issues and retry
```

---

### For Runtime Issues

```bash
# 1. Check what's failing
./scripts/troubleshooting/health-check.sh

# 2. Try auto-recovery
./scripts/troubleshooting/auto-recover.sh

# 3. If still failing, check logs
tail -f logs/combined.log
podman logs flexgate-postgres
podman logs flexgate-redis

# 4. Last resort: clean install
./scripts/troubleshooting/clean-install.sh
```

---

### For Total Corruption

```bash
# 1. Nuclear reset (DESTROYS DATA)
./scripts/troubleshooting/nuclear-reset.sh

# 2. Clean install
./scripts/troubleshooting/clean-install.sh
```

---

## Script Compatibility

All scripts support:
- ✅ macOS (zsh/bash)
- ✅ Linux (bash)
- ✅ Podman
- ✅ Docker
- ⚠️ Windows (WSL2 recommended)

---

## Automation Examples

### Daily Health Check (cron)

```bash
# Add to crontab: crontab -e
0 9 * * * cd /path/to/flexgate-proxy && ./scripts/troubleshooting/health-check.sh | mail -s "FlexGate Health" admin@example.com
```

---

### Auto-Recovery on Failure (systemd)

```ini
# /etc/systemd/system/flexgate-recovery.service
[Unit]
Description=FlexGate Auto-Recovery
After=network.target

[Service]
Type=oneshot
ExecStart=/path/to/flexgate-proxy/scripts/troubleshooting/auto-recover.sh
Restart=on-failure
RestartSec=30s

[Install]
WantedBy=multi-user.target
```

---

### Pre-Deployment Check (CI/CD)

```yaml
# .github/workflows/deploy.yml
- name: Health Check
  run: |
    ./scripts/troubleshooting/check-requirements.sh
    ./scripts/troubleshooting/health-check.sh
```

---

## Troubleshooting the Troubleshooting Scripts

### Scripts not executable

```bash
chmod +x scripts/troubleshooting/*.sh
```

### Command not found errors

Ensure you're in the FlexGate root directory:
```bash
cd /path/to/flexgate-proxy
./scripts/troubleshooting/health-check.sh
```

### Permission denied

```bash
# Option 1: Fix permissions
chmod +x scripts/troubleshooting/*.sh

# Option 2: Run with bash
bash scripts/troubleshooting/health-check.sh
```

---

## Contributing

To add new troubleshooting scripts:

1. Create script in `scripts/troubleshooting/`
2. Make it executable: `chmod +x script.sh`
3. Add documentation to this README
4. Add to main troubleshooting guide: `docs-site/guide/troubleshooting.md`
5. Test on macOS and Linux
6. Test with both Podman and Docker

---

## Need Help?

- 📖 Full troubleshooting guide: `/docs-site/guide/troubleshooting.md`
- 🐛 Report issues: https://github.com/tapas100/flexgate-proxy/issues
- 💬 Community support: (Discord link)

---

**Happy troubleshooting! 🛠️**
