# FlexGate AI Incident Tracking - CLI Complete ✅

## Overview

All Admin UI features are now available via the `flexgate` CLI! This enables automation, CI/CD integration, and headless operation.

## 🚀 Quick Start

```bash
# Install FlexGate globally
npm install -g flexgate-proxy

# Or use locally
npx flexgate <command>

# Or from project
./node_modules/.bin/flexgate <command>
```

## 📋 Command Reference

### AI Incident Management

#### List Incidents

```bash
# List all incidents
flexgate ai incidents

# Filter by status
flexgate ai incidents --status OPEN
flexgate ai incidents --status RESOLVED

# Filter by event type
flexgate ai incidents --type LATENCY_ANOMALY

# Filter by severity
flexgate ai incidents --severity CRITICAL

# Pagination
flexgate ai incidents --limit 50 --offset 100

# JSON output (for scripting)
flexgate ai incidents --json > incidents.json
```

**Example Output:**
```
🤖 Fetching AI incidents...

📊 Total: 45 incidents (showing 25)

ID            Event Type         Severity   Summary                                    Status      Detected            
evt_abc123    LATENCY_ANOMALY    WARNING    High latency detected on /api/users        RESOLVED    2/15/2026, 10:30 AM
evt_def456    ERROR_SPIKE        CRITICAL   Error rate spike: 15% in last 5 minutes    OPEN        2/15/2026, 11:45 AM
evt_ghi789    TRAFFIC_SURGE      INFO       Traffic increased by 300%                  INVESTIGATING 2/15/2026, 12:15 PM
```

#### Show Incident Detail

```bash
# Show full incident details
flexgate ai show <incident-id>

# JSON output
flexgate ai show evt_abc123 --json
```

**Example Output:**
```
🔍 Fetching incident evt_abc123...

📋 INCIDENT DETAILS
────────────────────────────────────────────────────────────
ID:              evt_abc123def456789
Event Type:      LATENCY_ANOMALY
Severity:        WARNING
Status:          RESOLVED
Summary:         High latency detected on /api/users endpoint
Detected At:     2/15/2026, 10:30:15 AM
Resolved At:     2/15/2026, 10:45:30 AM
Resolution Time: 15m 15s
User Rating:     ⭐⭐⭐⭐⭐ (5/5)
User Feedback:   Claude's recommendation worked perfectly!

💡 RECOMMENDATIONS
────────────────────────────────────────────────────────────

#1 - RESTART_SERVICE
  Confidence: 85.0% | Risk: low
  Reasoning: Connection pool exhaustion detected. Restart will clear stale connections.
  Decision: ACCEPTED - Low risk, quick fix

#2 - SCALE_UP
  Confidence: 65.0% | Risk: medium
  Reasoning: Increased load may require more capacity
  Decision: REJECTED - Not needed after restart

✅ OUTCOMES
────────────────────────────────────────────────────────────

RESTART_SERVICE - RESOLVED
  Executed: 2/15/2026, 10:35:00 AM
  Improvement: 62%
  Notes: Latency returned to normal after restart
```

#### Create Incident

```bash
# Create with defaults
flexgate ai create

# Create with custom type and severity
flexgate ai create --type ERROR_SPIKE --severity CRITICAL

# Create with full details
flexgate ai create \
  --type LATENCY_ANOMALY \
  --severity WARNING \
  --summary "Database queries timing out" \
  --metrics '{"latency_p95": 3500, "error_rate": 0.08}' \
  --context '{"service": "api-gateway", "database": "users_db"}'
```

**Example Output:**
```
🚀 Creating new incident...

✅ Incident created successfully!
Incident ID: evt_new789xyz
Status: OPEN
View details: flexgate ai show evt_new789xyz
```

#### Update Incident

```bash
# Update status
flexgate ai update evt_abc123 --status RESOLVED

# Add rating
flexgate ai update evt_abc123 --rating 5

# Add feedback
flexgate ai update evt_abc123 --feedback "Quick resolution, very helpful"

# All together
flexgate ai update evt_abc123 \
  --status RESOLVED \
  --rating 5 \
  --feedback "Worked perfectly!"
```

**Example Output:**
```
📝 Updating incident evt_abc123...

✅ Incident updated successfully!
Status: RESOLVED
Rating: ⭐⭐⭐⭐⭐
```

### AI Recommendations

#### Add Recommendations

```bash
# Add single recommendation
flexgate ai recommend evt_abc123 \
  --action RESTART_SERVICE \
  --reasoning "Connection pool exhaustion detected" \
  --confidence 0.85 \
  --risk low

# Add from JSON file
flexgate ai recommend evt_abc123 --file recommendations.json
```

**recommendations.json:**
```json
{
  "recommendations": [
    {
      "action_type": "RESTART_SERVICE",
      "reasoning": "Connection pool exhaustion",
      "confidence_score": 0.85,
      "risk_level": "low",
      "estimated_fix_time_minutes": 5
    },
    {
      "action_type": "SCALE_UP",
      "reasoning": "High sustained load",
      "confidence_score": 0.65,
      "risk_level": "medium",
      "estimated_fix_time_minutes": 30
    }
  ]
}
```

**Example Output:**
```
💡 Adding recommendations to incident evt_abc123...

✅ Added 2 recommendation(s)
  • RESTART_SERVICE (confidence: 85.0%)
  • SCALE_UP (confidence: 65.0%)
```

#### Record Decision

```bash
# Accept recommendation
flexgate ai decide evt_abc123 1 \
  --decision ACCEPTED \
  --reason "Low risk, quick fix"

# Reject recommendation
flexgate ai decide evt_abc123 2 \
  --decision REJECTED \
  --reason "Not needed after restart"

# Modify recommendation
flexgate ai decide evt_abc123 3 \
  --decision MODIFIED \
  --reason "Will scale up by 50% instead of 100%" \
  --action SCALE_UP_50
```

**Example Output:**
```
🎯 Recording decision for recommendation 1...

✅ Decision recorded successfully!
Decision: ACCEPTED
Reason: Low risk, quick fix
```

### Action Outcomes

#### Record Outcome

```bash
# Record successful outcome
flexgate ai outcome evt_abc123 \
  --action RESTART_SERVICE \
  --status RESOLVED \
  --before '{"latency_p95": 2500, "error_rate": 0.05}' \
  --after '{"latency_p95": 950, "error_rate": 0.01}' \
  --improvement 62 \
  --notes "Latency returned to normal"

# Record partial success
flexgate ai outcome evt_abc123 \
  --action SCALE_UP \
  --status PARTIAL \
  --improvement 30 \
  --notes "Helped but didn't fully resolve"

# Record failure
flexgate ai outcome evt_abc123 \
  --action UPDATE_CONFIG \
  --status FAILED \
  --notes "Config rollback required"
```

**Example Output:**
```
📊 Recording outcome for incident evt_abc123...

✅ Outcome recorded successfully!
Action: RESTART_SERVICE
Status: RESOLVED
Improvement: 62%
```

### Analytics

#### View Analytics Dashboard

```bash
# Default (last 30 days)
flexgate ai analytics

# Custom time range
flexgate ai analytics --days 7
flexgate ai analytics --days 90

# JSON output
flexgate ai analytics --json > analytics.json
```

**Example Output:**
```
📈 Fetching analytics (last 30 days)...

📊 INCIDENT SUMMARY
────────────────────────────────────────────────────────────
Total Incidents:     150
Open:                15
Resolved:            120
False Positives:     15
Resolution Rate:     85.7%
Avg Resolution Time: 12m 45s

💡 RECOMMENDATION METRICS
────────────────────────────────────────────────────────────
Total Recommendations: 245
Accepted:              180
Rejected:              45
Modified:              20
Acceptance Rate:       73.5%

⭐ QUALITY METRICS
────────────────────────────────────────────────────────────
Avg User Rating:     ⭐⭐⭐⭐ (4.2/5)
Avg AI Confidence:   78.5%

🎯 ACTION TYPE PERFORMANCE
────────────────────────────────────────────────────────────

Action Type       Total  Accept %  Resolve %  Confidence
RESTART_SERVICE   85     90.6%     88.2%      82.3%
SCALE_UP          60     70.0%     95.0%      75.8%
UPDATE_CONFIG     45     62.2%     80.0%      68.5%
ROLLBACK_DEPLOY   30     86.7%     90.0%      85.0%
CLEAR_CACHE       25     80.0%     85.0%      72.0%

💰 ROI ESTIMATES
────────────────────────────────────────────────────────────
Time Saved:          60 hours (vs manual troubleshooting)
Incidents Prevented: 15 false positives caught
Automation Level:    73.5%
```

### Data Export

#### Export Incidents

```bash
# Export all incidents as JSON
flexgate ai export

# Export as CSV
flexgate ai export --format csv

# Export to specific file
flexgate ai export --output my_incidents.json

# Filter exports
flexgate ai export --status RESOLVED --format csv --output resolved.csv
flexgate ai export --days 7 --format json --output last_week.json
```

**Example Output:**
```
📦 Exporting incidents...

✅ Exported 150 incidents to incidents_1708012345678.json
```

### Real-Time Monitoring

#### Watch for New Incidents

```bash
# Watch with default interval (10 seconds)
flexgate ai watch

# Custom polling interval
flexgate ai watch --interval 5

# Watch and pipe to log file
flexgate ai watch >> incident_alerts.log
```

**Example Output:**
```
👁️  Watching for new incidents (Ctrl+C to stop)...

🔔 2 new incident(s) detected!
  ● evt_new123 - LATENCY_ANOMALY [WARNING]
    High latency on /api/users endpoint
  ● evt_new456 - ERROR_SPIKE [CRITICAL]
    Sudden increase in 500 errors

🔔 1 new incident(s) detected!
  ● evt_new789 - TRAFFIC_SURGE [INFO]
    Traffic spike detected
```

## 🔧 Automation Examples

### CI/CD Integration

```bash
#!/bin/bash
# deploy-with-monitoring.sh

echo "Deploying application..."
./deploy.sh

# Create incident for deployment tracking
INCIDENT_ID=$(flexgate ai create \
  --type DEPLOYMENT \
  --severity INFO \
  --summary "Production deployment v2.5.0" \
  --json | jq -r '.incident_id')

echo "Monitoring deployment (incident: $INCIDENT_ID)..."

# Watch for 5 minutes
sleep 300

# Check error rates
ERROR_RATE=$(curl -s http://localhost:8080/api/stream/metrics | grep error_rate | awk '{print $2}')

if (( $(echo "$ERROR_RATE > 0.05" | bc -l) )); then
  # Record failure
  flexgate ai outcome $INCIDENT_ID \
    --action DEPLOYMENT \
    --status FAILED \
    --notes "Error rate exceeded threshold: $ERROR_RATE"
  
  # Rollback
  echo "Rolling back..."
  ./rollback.sh
else
  # Record success
  flexgate ai outcome $INCIDENT_ID \
    --action DEPLOYMENT \
    --status RESOLVED \
    --notes "Deployment successful, error rate normal"
fi
```

### Automated Incident Response

```bash
#!/bin/bash
# auto-respond.sh

# Get open critical incidents
flexgate ai incidents \
  --status OPEN \
  --severity CRITICAL \
  --json | jq -r '.incidents[].incident_id' | while read INCIDENT_ID; do
  
  echo "Processing incident: $INCIDENT_ID"
  
  # Get incident details
  INCIDENT=$(flexgate ai show $INCIDENT_ID --json)
  EVENT_TYPE=$(echo $INCIDENT | jq -r '.event_type')
  
  case $EVENT_TYPE in
    LATENCY_ANOMALY)
      echo "Auto-applying restart for latency issue..."
      
      # Add recommendation
      flexgate ai recommend $INCIDENT_ID \
        --action RESTART_SERVICE \
        --reasoning "Auto-remediation for latency spike" \
        --confidence 0.9
      
      # Execute restart
      systemctl restart api-gateway
      
      # Record outcome
      flexgate ai outcome $INCIDENT_ID \
        --action RESTART_SERVICE \
        --status RESOLVED \
        --notes "Auto-restarted service"
      ;;
      
    MEMORY_LEAK)
      echo "Memory leak detected, scaling up..."
      
      # Scale up
      kubectl scale deployment api-gateway --replicas=10
      
      # Record outcome
      flexgate ai outcome $INCIDENT_ID \
        --action SCALE_UP \
        --status RESOLVED \
        --notes "Auto-scaled to 10 replicas"
      ;;
  esac
done
```

### Daily Reports

```bash
#!/bin/bash
# daily-report.sh

DATE=$(date +%Y-%m-%d)
REPORT_FILE="ai_incident_report_$DATE.txt"

{
  echo "FlexGate AI Incident Report - $DATE"
  echo "=========================================="
  echo ""
  
  echo "📊 Analytics (Last 24 Hours)"
  echo "----------------------------"
  flexgate ai analytics --days 1
  
  echo ""
  echo "🔴 Open Critical Incidents"
  echo "-------------------------"
  flexgate ai incidents --status OPEN --severity CRITICAL
  
  echo ""
  echo "✅ Recently Resolved"
  echo "-------------------"
  flexgate ai incidents --status RESOLVED --limit 10
  
} > $REPORT_FILE

# Email report
mail -s "AI Incident Report - $DATE" ops-team@company.com < $REPORT_FILE

# Upload to S3
aws s3 cp $REPORT_FILE s3://reports/ai-incidents/
```

### Slack Notifications

```bash
#!/bin/bash
# slack-notify.sh

flexgate ai watch --interval 30 | while read LINE; do
  if [[ $LINE == *"new incident"* ]]; then
    # Parse incident details
    INCIDENT_ID=$(echo $LINE | grep -oE 'evt_[a-z0-9]+')
    
    # Get full details
    DETAILS=$(flexgate ai show $INCIDENT_ID --json)
    
    # Post to Slack
    curl -X POST $SLACK_WEBHOOK_URL \
      -H 'Content-Type: application/json' \
      -d "{
        \"text\": \"🔔 New AI Incident Detected\",
        \"attachments\": [{
          \"color\": \"danger\",
          \"fields\": [
            {\"title\": \"Incident ID\", \"value\": \"$INCIDENT_ID\", \"short\": true},
            {\"title\": \"Type\", \"value\": \"$(echo $DETAILS | jq -r '.event_type')\", \"short\": true},
            {\"title\": \"Severity\", \"value\": \"$(echo $DETAILS | jq -r '.severity')\", \"short\": true},
            {\"title\": \"Summary\", \"value\": \"$(echo $DETAILS | jq -r '.summary')\", \"short\": false}
          ]
        }]
      }"
  fi
done
```

### Prometheus Alert Integration

```bash
#!/bin/bash
# prometheus-to-incident.sh
# Called by Prometheus Alertmanager webhook

# Parse Prometheus alert
ALERT_NAME=$(echo $1 | jq -r '.alerts[0].labels.alertname')
SEVERITY=$(echo $1 | jq -r '.alerts[0].labels.severity')
SUMMARY=$(echo $1 | jq -r '.alerts[0].annotations.summary')
METRICS=$(echo $1 | jq -r '.alerts[0].annotations.metrics')

# Map Prometheus severity to FlexGate severity
case $SEVERITY in
  critical) FG_SEVERITY="CRITICAL" ;;
  warning)  FG_SEVERITY="WARNING" ;;
  *)        FG_SEVERITY="INFO" ;;
esac

# Create incident
INCIDENT_ID=$(flexgate ai create \
  --type "PROMETHEUS_ALERT" \
  --severity $FG_SEVERITY \
  --summary "$ALERT_NAME: $SUMMARY" \
  --metrics "$METRICS" \
  --json | jq -r '.incident_id')

echo "Created incident: $INCIDENT_ID"

# Add to Prometheus annotations
curl -X POST http://localhost:9090/api/v1/alerts \
  -d "alerts=[{
    \"labels\": {\"incident_id\": \"$INCIDENT_ID\"}
  }]"
```

## 🎯 Best Practices

### 1. Use JSON Output for Scripting

```bash
# Always use --json for parsing in scripts
INCIDENTS=$(flexgate ai incidents --status OPEN --json)
COUNT=$(echo $INCIDENTS | jq '.total')

if [ $COUNT -gt 10 ]; then
  echo "Too many open incidents!"
  # Send alert
fi
```

### 2. Error Handling

```bash
# Check exit codes
if ! flexgate ai create --type ERROR_SPIKE; then
  echo "Failed to create incident"
  exit 1
fi

# Capture output
OUTPUT=$(flexgate ai show $ID 2>&1)
if [ $? -ne 0 ]; then
  echo "Error: $OUTPUT"
fi
```

### 3. Rate Limiting

```bash
# Don't poll too frequently
flexgate ai watch --interval 30  # 30 seconds minimum

# Batch operations
for id in $(cat incident_ids.txt); do
  flexgate ai update $id --status RESOLVED
  sleep 1  # Avoid rate limits
done
```

### 4. Logging

```bash
# Log all CLI operations
LOGFILE=/var/log/flexgate-cli.log

{
  echo "[$(date)] Starting incident check"
  flexgate ai incidents --status OPEN
  echo "[$(date)] Check complete"
} >> $LOGFILE 2>&1
```

## 📚 Configuration

### Environment Variables

```bash
# Set API endpoint (if not default)
export FLEXGATE_API_URL=http://api.example.com:8080

# Set config directory
export FLEXGATE_CONFIG_DIR=/etc/flexgate

# Set log level
export FLEXGATE_LOG_LEVEL=debug
```

### Config File

The CLI uses the same `flexgate.json` config:

```json
{
  "server": {
    "port": 8080,
    "host": "localhost"
  }
}
```

## 🐛 Troubleshooting

### Connection Errors

```bash
# Test API connectivity
curl http://localhost:8080/health

# Check if server is running
ps aux | grep node | grep flexgate

# Verify config
flexgate config show
```

### Authentication Issues

```bash
# CLI uses the same auth as Admin UI
# Make sure you're authenticated

# For API key auth (if enabled)
export FLEXGATE_API_KEY=your_api_key_here
```

### Debug Mode

```bash
# Enable verbose output
DEBUG=flexgate:* flexgate ai incidents

# Show raw API responses
flexgate ai incidents --json | jq '.'
```

## 🚀 Advanced Usage

### Chaining Commands

```bash
# Create incident and immediately add recommendation
INCIDENT_ID=$(flexgate ai create --type ERROR_SPIKE --json | jq -r '.incident_id')
flexgate ai recommend $INCIDENT_ID --action RESTART_SERVICE --confidence 0.9
flexgate ai show $INCIDENT_ID
```

### Bulk Operations

```bash
# Resolve all old incidents
flexgate ai incidents --status INVESTIGATING --json | \
  jq -r '.incidents[] | select(.detected_at < "2026-01-01") | .incident_id' | \
  while read id; do
    flexgate ai update $id --status RESOLVED --feedback "Auto-resolved old incident"
  done
```

### Custom Dashboards

```bash
# Build custom dashboard in terminal
watch -n 5 '
  clear
  echo "=== FlexGate AI Dashboard ==="
  echo ""
  echo "Open Incidents:"
  flexgate ai incidents --status OPEN --limit 5
  echo ""
  echo "Analytics:"
  flexgate ai analytics --days 1
'
```

## 📊 Output Formats

### Table Format (Default)

Human-readable tables for terminal viewing.

### JSON Format

Machine-readable JSON for scripting:

```bash
flexgate ai incidents --json | jq '.incidents[] | {id, type, status}'
```

### CSV Format

For spreadsheet import:

```bash
flexgate ai export --format csv --output incidents.csv
```

## 🎓 Learning Resources

### Example Scripts

All examples above are production-ready. Copy and adapt for your use case.

### Integration Examples

- **Jenkins**: Add to pipeline stages
- **GitHub Actions**: Use in workflows
- **Kubernetes**: CronJob for monitoring
- **Terraform**: Post-deployment checks
- **Ansible**: Incident tracking in playbooks

## ✅ Summary

**All Admin UI features are now CLI-accessible:**

- ✅ List and filter incidents
- ✅ View detailed incident information
- ✅ Create new incidents
- ✅ Update incident status and feedback
- ✅ Add AI recommendations
- ✅ Record user decisions
- ✅ Record action outcomes
- ✅ View analytics dashboard
- ✅ Export data (JSON/CSV)
- ✅ Real-time monitoring (watch mode)
- ✅ Automation-friendly (JSON output, exit codes)
- ✅ CI/CD integration examples
- ✅ Slack/email notification examples
- ✅ Prometheus integration example

**Perfect for:**
- DevOps automation
- CI/CD pipelines
- Monitoring and alerting
- Reporting and analytics
- Headless operation
- Scripting and integration
- Real-time incident response

**Next Steps:**
1. Test CLI commands: `flexgate ai --help`
2. Try example scripts
3. Integrate with your automation
4. Build custom workflows

**The FlexGate CLI makes AI-powered incident management accessible from anywhere!** 🚀
