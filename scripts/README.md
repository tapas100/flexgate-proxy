# FlexGate Scripts

This directory contains utility scripts for FlexGate development, testing, and deployment.

## 📁 Directory Structure

```
scripts/
├── deployment/          # Deployment and repository management
├── testing/            # Testing automation scripts
├── cleanup-branches.sh # Git branch cleanup
└── setup-database-native.sh # PostgreSQL setup (Homebrew)
```

## 🗄️ Database Setup Scripts

### `setup-database-native.sh`
Sets up PostgreSQL database using Homebrew (native installation).

**Usage:**
```bash
./scripts/setup-database-native.sh
```

**Features:**
- Installs PostgreSQL@16 via Homebrew
- Creates `flexgate` database
- Creates database user
- Runs migrations
- Seeds initial data
- Generates JWT secret
- Updates .env file

**Requirements:**
- macOS with Homebrew
- No Docker required

---

## 🧪 Testing Scripts (`testing/`)

### `test-execution.sh`
Comprehensive test execution script for running all test suites.

**Usage:**
```bash
./scripts/testing/test-execution.sh
```

**Features:**
- Runs backend tests
- Runs frontend tests
- Runs E2E tests
- Generates test reports

---

### `test-routes-api.sh`
Tests the Routes API endpoints.

**Usage:**
```bash
./scripts/testing/test-routes-api.sh
```

**Features:**
- Tests all 6 Routes API endpoints
- Validates CRUD operations
- Checks data persistence

---

### `setup-test-repo.sh`
Sets up the separate test repository for E2E tests.

**Usage:**
```bash
./scripts/testing/setup-test-repo.sh
```

**Features:**
- Creates `flexgate-tests` repository
- Copies test files
- Installs dependencies
- Configures Playwright

---

## 🚀 Deployment Scripts (`deployment/`)

### `create-flexgate-repos.sh`
Creates multiple FlexGate repositories for microservices architecture.

**Usage:**
```bash
./scripts/deployment/create-flexgate-repos.sh
```

**Features:**
- Creates multiple Git repositories
- Sets up repository structure
- Initializes with README files

**Repositories Created:**
- flexgate-proxy
- flexgate-admin-ui
- flexgate-agent
- flexgate-control-plane
- flexgate-llm-gateway
- (and more...)

---

### `init-all-repos.sh`
Initializes all FlexGate repositories with common setup.

**Usage:**
```bash
./scripts/deployment/init-all-repos.sh
```

**Features:**
- Initializes Git
- Sets up .gitignore
- Creates basic structure
- Adds common dependencies

---

## 🌿 Git Management

### `cleanup-branches.sh`
Cleans up merged and stale Git branches.

**Usage:**
```bash
./scripts/cleanup-branches.sh
```

**Features:**
- Lists merged branches
- Deletes merged feature branches
- Optionally deletes remote branches
- Interactive mode for safety

**Options:**
```bash
# Dry run (shows what would be deleted)
./scripts/cleanup-branches.sh --dry-run

# Delete remote branches too
./scripts/cleanup-branches.sh --remote

# Force delete without confirmation
./scripts/cleanup-branches.sh --force
```

---

## 📋 Other Script Locations

### Launch Scripts
Located in `launch/` directory:
- `day-1-2-checklist.sh` - Day 1-2 launch preparation checklist

### Benchmark Scripts
Located in `benchmarks/` directory:
- `run.sh` - Performance benchmarking script

### Test File Scripts
Located in `test-files-to-copy/` directory:
- `copy-to-test-repo.sh` - Copies test files to test repository

---

## 🔧 Script Development Guidelines

### Making Scripts Executable
```bash
chmod +x scripts/your-script.sh
```

### Script Header Template
```bash
#!/bin/bash
set -e  # Exit on error

echo "🚀 Script Name"
echo "Description of what this script does"
echo ""

# Your script logic here
```

### Error Handling
```bash
if ! command -v some_command &> /dev/null; then
    echo "❌ Error: some_command not found"
    exit 1
fi
```

### Colorized Output
```bash
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}✅ Success${NC}"
echo -e "${RED}❌ Error${NC}"
echo -e "${YELLOW}⚠️  Warning${NC}"
```

---

## 📝 Contributing New Scripts

1. **Choose the right directory:**
   - `deployment/` - Deployment and infrastructure
   - `testing/` - Testing and QA
   - Root `scripts/` - General utilities

2. **Name your script descriptively:**
   - Use kebab-case: `setup-new-feature.sh`
   - Be specific: `migrate-postgres-to-v15.sh`

3. **Add documentation:**
   - Update this README
   - Add comments in the script
   - Include usage examples

4. **Test your script:**
   - Test on clean environment
   - Handle errors gracefully
   - Provide helpful error messages

5. **Make it executable:**
   ```bash
   chmod +x scripts/your-new-script.sh
   ```

---

## 🔍 Quick Reference

| Task | Script |
|------|--------|
| Setup database (native) | `./scripts/setup-database-native.sh` |
| Setup database (Docker) | `./scripts/setup-database.sh` |
| Run all tests | `./scripts/testing/test-execution.sh` |
| Test Routes API | `./scripts/testing/test-routes-api.sh` |
| Setup test repo | `./scripts/testing/setup-test-repo.sh` |
| Create repositories | `./scripts/deployment/create-flexgate-repos.sh` |
| Initialize repos | `./scripts/deployment/init-all-repos.sh` |
| Cleanup branches | `./scripts/cleanup-branches.sh` |
| Run benchmarks | `./benchmarks/run.sh` |
| Launch checklist | `./launch/day-1-2-checklist.sh` |

---

## 🆘 Troubleshooting

### Script Not Executable
```bash
chmod +x scripts/script-name.sh
```

### Permission Denied
```bash
# Use bash explicitly
bash scripts/script-name.sh
```

### Path Issues
```bash
# Run from project root
cd /path/to/flexgate-proxy
./scripts/script-name.sh
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
brew services list | grep postgresql

# Start PostgreSQL
brew services start postgresql@16
```

---

## 📚 Additional Resources

- [Main README](../README.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
- [Database Setup Guide](../docs/development/DATABASE_SETUP.md)
- [Testing Guide](../docs/testing/e2e-guide.md)
