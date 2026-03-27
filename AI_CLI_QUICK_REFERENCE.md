# FlexGate CLI - Quick Reference Card 🚀

## Installation

```bash
# Global (recommended)
npm install -g flexgate-proxy

# Usage
flexgate <command>
```

---

## Core Commands

| Command | Description | Example |
|---------|-------------|---------|
| `flexgate init` | Initialize configuration | `flexgate init --interactive` |
| `flexgate config show` | Display current config | `flexgate config show` |
| `flexgate health` | Check system health | `flexgate health` |

---

## AI Incident Commands

### List & View

```bash
# List all incidents
flexgate ai incidents

# Filter by status
flexgate ai incidents --status OPEN

# Filter by severity
flexgate ai incidents --severity CRITICAL

# Search and filter
flexgate ai incidents --type LATENCY_ANOMALY --limit 50

# View incident detail
flexgate ai show evt_abc123

# JSON output (for scripting)
flexgate ai incidents --json | jq '.'
```

### Create & Update

```bash
# Create incident (with defaults)
flexgate ai create

# Create with full details
flexgate ai create \
  --type ERROR_SPIKE \
  --severity CRITICAL \
  --summary "API error rate spike" \
  --metrics '{"error_rate": 0.15}' \
  --context '{"service": "api-gateway"}'

# Update incident status
flexgate ai update evt_abc123 --status RESOLVED

# Add rating and feedback
flexgate ai update evt_abc123 \
  --rating 5 \
  --feedback "Quick resolution!"

# Update all at once
flexgate ai update evt_abc123 \
  --status RESOLVED \
  --rating 5 \
  --feedback "Worked perfectly"
```

### Recommendations

```bash
# Add single recommendation
flexgate ai recommend evt_abc123 \
  --action RESTART_SERVICE \
  --reasoning "Connection pool exhausted" \
  --confidence 0.85 \
  --risk low

# Add from JSON file
flexgate ai recommend evt_abc123 --file recs.json

# Record decision
flexgate ai decide evt_abc123 1 \
  --decision ACCEPTED \
  --reason "Low risk, quick fix"

# Reject recommendation
flexgate ai decide evt_abc123 2 \
  --decision REJECTED \
  --reason "Not applicable"
```

### Outcomes

```bash
# Record successful outcome
flexgate ai outcome evt_abc123 \
  --action RESTART_SERVICE \
  --status RESOLVED \
  --before '{"latency_p95": 2500}' \
  --after '{"latency_p95": 950}' \
  --improvement 62 \
  --notes "Back to normal"

# Record partial success
flexgate ai outcome evt_abc123 \
  --action SCALE_UP \
  --status PARTIAL \
  --improvement 30

# Record failure
flexgate ai outcome evt_abc123 \
  --action UPDATE_CONFIG \
  --status FAILED \
  --notes "Config rollback needed"
```

### Analytics

```bash
# View analytics (default 30 days)
flexgate ai analytics

# Custom time range
flexgate ai analytics --days 7
flexgate ai analytics --days 90

# JSON output
flexgate ai analytics --json > analytics.json
```

### Export & Monitor

```bash
# Export to JSON
flexgate ai export --output incidents.json

# Export to CSV
flexgate ai export --format csv --output data.csv

# Export filtered data
flexgate ai export \
  --status RESOLVED \
  --format csv \
  --output resolved.csv

# Watch for new incidents (real-time)
flexgate ai watch

# Custom polling interval
flexgate ai watch --interval 30
```

---

## Common Workflows

### 1. Quick Incident Check
```bash
# Morning routine
flexgate ai incidents --status OPEN
flexgate ai analytics --days 1
```

### 2. Create & Track Incident
```bash
# Create incident
ID=$(flexgate ai create --type ERROR_SPIKE --json | jq -r '.incident_id')

# Add recommendation
flexgate ai recommend $ID --action RESTART_SERVICE --confidence 0.9

# Accept and execute
flexgate ai decide $ID 1 --decision ACCEPTED

# Restart service (your command)
systemctl restart api-gateway

# Record outcome
flexgate ai outcome $ID \
  --action RESTART_SERVICE \
  --status RESOLVED \
  --improvement 75

# Update status
flexgate ai update $ID --status RESOLVED --rating 5
```

### 3. Daily Report
```bash
# Generate report
{
  echo "=== FlexGate Daily Report ==="
  echo ""
  flexgate ai analytics --days 1
  echo ""
  echo "Recent Incidents:"
  flexgate ai incidents --limit 10
} > daily_report.txt

# Email it
mail -s "FlexGate Report" team@company.com < daily_report.txt
```

### 4. Automated Response
```bash
# Check for critical incidents
flexgate ai incidents --status OPEN --severity CRITICAL --json | \
  jq -r '.incidents[].incident_id' | while read ID; do
  
  # Get details
  EVENT=$(flexgate ai show $ID --json | jq -r '.event_type')
  
  # Auto-remediate
  case $EVENT in
    LATENCY_ANOMALY)
      systemctl restart service
      flexgate ai outcome $ID --action RESTART_SERVICE --status RESOLVED
      ;;
  esac
done
```

---

## Filters & Options

### Status Filters
- `OPEN` - New incidents
- `INVESTIGATING` - Being analyzed
- `RESOLVED` - Fixed
- `FALSE_POSITIVE` - Not real issues

### Severity Filters
- `CRITICAL` - Urgent
- `WARNING` - Important
- `INFO` - Informational

### Common Event Types
- `LATENCY_ANOMALY`
- `ERROR_SPIKE`
- `TRAFFIC_SURGE`
- `MEMORY_LEAK`
- `CPU_SPIKE`
- `DISK_FULL`

### Decision Types
- `ACCEPTED` - Will execute
- `REJECTED` - Won't execute
- `MODIFIED` - Executing different action
- `SKIPPED` - Ignoring for now

### Outcome Status
- `RESOLVED` - Fixed the issue
- `PARTIAL` - Helped but not complete
- `FAILED` - Didn't work

---

## Automation Examples

### Cron Job - Daily Analytics
```bash
# crontab -e
0 9 * * * /usr/local/bin/flexgate ai analytics --days 1 | mail -s "Daily AI Report" team@company.com
```

### CI/CD Integration
```bash
# .github/workflows/deploy.yml
- name: Monitor Deployment
  run: |
    INCIDENT=$(flexgate ai create --type DEPLOYMENT --json | jq -r '.incident_id')
    sleep 300
    ERROR_RATE=$(curl -s localhost:8080/metrics | grep error_rate | awk '{print $2}')
    if [ "$ERROR_RATE" -gt "0.05" ]; then
      flexgate ai outcome $INCIDENT --action DEPLOYMENT --status FAILED
      exit 1
    fi
    flexgate ai outcome $INCIDENT --action DEPLOYMENT --status RESOLVED
```

### Slack Notifications
```bash
# Run in background
flexgate ai watch | while read LINE; do
  if [[ $LINE == *"new incident"* ]]; then
    ID=$(echo $LINE | grep -oE 'evt_[a-z0-9]+')
    curl -X POST $SLACK_WEBHOOK -d "{\"text\":\"🚨 Incident: $ID\"}"
  fi
done &
```

---

## Output Formats

### Table Format (Default)
```
ID            Event Type      Severity   Summary         Status    
evt_abc123    LATENCY_ANOMALY WARNING    High latency    RESOLVED  
```

### JSON Format (Scripting)
```bash
flexgate ai incidents --json | jq '.incidents[] | {id, status}'
```

### CSV Format (Spreadsheets)
```bash
flexgate ai export --format csv | head -5
```

---

## Troubleshooting

### Connection Errors
```bash
# Check if API is running
curl http://localhost:8080/health

# Verify config
flexgate config show

# Test connections
flexgate health
```

### Debug Mode
```bash
# Show raw API responses
flexgate ai incidents --json | jq '.'

# Verbose mode (if implemented)
DEBUG=flexgate:* flexgate ai incidents
```

---

## Tips & Tricks

### 1. Pipe to jq for Advanced Filtering
```bash
# Get only critical incidents
flexgate ai incidents --json | jq '.incidents[] | select(.severity == "CRITICAL")'

# Extract incident IDs
flexgate ai incidents --json | jq -r '.incidents[].incident_id'

# Count by status
flexgate ai incidents --json | jq '.incidents | group_by(.status) | map({status: .[0].status, count: length})'
```

### 2. Chain Commands
```bash
# Create and immediately view
ID=$(flexgate ai create --json | jq -r '.incident_id') && flexgate ai show $ID
```

### 3. Bulk Operations
```bash
# Resolve all old incidents
flexgate ai incidents --status INVESTIGATING --json | \
  jq -r '.incidents[] | select(.detected_at < "2026-01-01") | .incident_id' | \
  while read id; do
    flexgate ai update $id --status RESOLVED --feedback "Auto-resolved"
  done
```

### 4. Watch Mode with Filtering
```bash
# Watch only critical incidents
flexgate ai watch | grep "CRITICAL"
```

### 5. Export for Analysis
```bash
# Export last week to CSV for Excel
flexgate ai export \
  --days 7 \
  --format csv \
  --output "weekly_$(date +%Y%m%d).csv"
```

---

## Environment Variables

```bash
# Set API endpoint
export FLEXGATE_API_URL=http://api.example.com:8080

# Set config directory
export FLEXGATE_CONFIG_DIR=/etc/flexgate

# API key (if using auth)
export FLEXGATE_API_KEY=your_key_here
```

---

## Help Commands

```bash
# Main help
flexgate --help

# AI commands help
flexgate ai --help

# Specific command help
flexgate ai incidents --help
flexgate ai show --help
flexgate ai create --help
```

---

## Key Shortcuts

| Task | Short Command | Full Command |
|------|---------------|--------------|
| List incidents | `flexgate ai i` | `flexgate ai incidents` |
| Show incident | `flexgate ai s <id>` | `flexgate ai show <id>` |

*(Note: Aliases may need to be configured)*

---

## Performance Tips

1. **Use JSON output** for scripting (faster parsing)
2. **Limit results** with `--limit` to reduce data transfer
3. **Poll less frequently** in watch mode (>30s recommended)
4. **Filter at the source** using CLI flags, not post-processing
5. **Batch exports** instead of many small queries

---

## Best Practices

✅ **DO:**
- Use `--json` for automation scripts
- Check exit codes in scripts
- Use watch mode for real-time monitoring
- Export data for long-term analysis
- Add descriptive feedback when updating incidents

❌ **DON'T:**
- Poll too frequently (< 10s in watch mode)
- Skip error handling in scripts
- Forget to add decision reasons
- Ignore exit codes
- Hard-code incident IDs

---

## Getting Help

- **Documentation**: `AI_CLI_COMPLETE.md`
- **Examples**: See automation section in docs
- **Issues**: GitHub Issues
- **CLI Help**: `flexgate ai --help`

---

**Quick Links:**
- Full Documentation: [AI_CLI_COMPLETE.md](AI_CLI_COMPLETE.md)
- UI vs CLI Guide: [UI_CLI_DUAL_INTERFACE.md](UI_CLI_DUAL_INTERFACE.md)
- Implementation Details: [AI_CLI_IMPLEMENTATION_COMPLETE.md](AI_CLI_IMPLEMENTATION_COMPLETE.md)

**Happy automating! 🚀**
