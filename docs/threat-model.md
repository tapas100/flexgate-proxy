# Threat Model

## Overview
This document identifies security threats to the proxy server and our mitigation strategies.

**Last Updated**: January 26, 2026  
**Next Review**: April 26, 2026

## Trust Model
```
UNTRUSTED → [Proxy (Trust Boundary)] → TRUSTED
```
- Everything before the proxy is untrusted
- Everything after is trusted (assumes validation passed)

---

## Attack Vectors & Mitigations

### 1. Server-Side Request Forgery (SSRF)
**Risk Level**: 🔴 CRITICAL

#### Attack
Attacker manipulates proxy to make requests to internal services:
```http
POST /proxy
{
  "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
}
```

#### Impact
- Access to cloud metadata endpoints (AWS, GCP, Azure)
- Internal service enumeration
- Exfiltration of secrets

#### Mitigations
✅ **Implemented**:
1. **Allow-list of target hosts** (no arbitrary URLs)
2. **IP blacklist**: Block private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
3. **Block cloud metadata IPs**: 169.254.169.254, fd00:ec2::254
4. **DNS rebinding protection**: Resolve and validate target IP before connecting
5. **Protocol restriction**: Only HTTP/HTTPS (no file://, gopher://, etc.)

✅ **Configuration**:
```yaml
proxy:
  allowedHosts:
    - "api.example.com"
    - "*.internal.corp"
  blockedIPs:
    - "169.254.169.254"
    - "10.0.0.0/8"
    - "127.0.0.0/8"
```

#### What We Don't Block (And Why)
- ❌ DNS-based SSRF via TTL manipulation → **Mitigation**: DNS caching (60s TTL)
- ❌ IPv6 SSRF variants → **Future work**: Add IPv6 range validation

---

### 2. Header Injection
**Risk Level**: 🟠 HIGH

#### Attack
Inject malicious headers via unvalidated input:
```http
GET /proxy?target=evil.com HTTP/1.1
X-Custom-Header: foo\r\nX-Admin: true
```

#### Impact
- HTTP response splitting
- Cache poisoning
- Authentication bypass

#### Mitigations
✅ **Implemented**:
1. **Header sanitization**: Strip CRLF (\r\n) from all header values
2. **Forbidden headers**: Block `Host`, `Connection`, `Transfer-Encoding` from client
3. **Header size limits**: Max 8KB per header, 32KB total

```javascript
const FORBIDDEN_HEADERS = ['host', 'connection', 'transfer-encoding', 'upgrade'];
const SANITIZE_REGEX = /[\r\n]/g;
```

---

### 3. Denial of Service (DoS)
**Risk Level**: 🟠 HIGH

#### Attack Variants

##### 3a. Request Flood
High volume of requests exhaust resources.

**Mitigations**:
✅ Rate limiting (token bucket algorithm)
✅ Connection limits per IP
✅ Request size limits

##### 3b. Slowloris
Client sends headers slowly to exhaust connections.

**Mitigations**:
✅ Header timeout (10s)
✅ Request timeout (30s)
✅ Idle connection timeout (60s)

##### 3c. Large Payload
Massive request/response bodies consume memory.

**Mitigations**:
✅ Max body size: 10MB request, 50MB response
✅ Streaming responses (no buffering)
✅ Memory-based backpressure

#### Configuration
```yaml
limits:
  rateLimit:
    windowMs: 60000
    max: 100
  requestTimeout: 30000
  maxBodySize: 10485760  # 10MB
```

---

### 4. Authentication Bypass
**Risk Level**: 🔴 CRITICAL

#### Attack
- Reuse expired tokens
- Forge signatures
- Missing authentication on routes

#### Mitigations
✅ **Implemented**:
1. **API Key validation**: HMAC-SHA256 signature verification
2. **Key rotation**: Support multiple valid keys during rotation
3. **Time-based validation**: Reject requests with timestamp drift > 5 minutes
4. **Deny by default**: Routes require explicit `auth: true` in config

```yaml
routes:
  - path: "/api/*"
    auth: required  # Explicit opt-in
    upstream: "https://api.backend.com"
```

#### What We Don't Do (Intentionally)
- ❌ OAuth/OIDC flows → **Reason**: Complexity, use Kong/Auth0 for this
- ❌ Session management → **Reason**: Stateless design

---

### 5. Path Traversal
**Risk Level**: 🟡 MEDIUM

#### Attack
```http
GET /proxy/../../../etc/passwd
```

#### Mitigations
✅ **Implemented**:
1. **Path normalization**: Resolve `..` before routing
2. **Absolute path validation**: No paths outside configured base
3. **Reject encoded slashes**: Block `%2F`, `%5C`

---

### 6. Injection Attacks
**Risk Level**: 🟡 MEDIUM

#### 6a. Command Injection
Not applicable (no shell commands executed).

#### 6b. NoSQL Injection
If config uses MongoDB, attacker could inject queries.

**Mitigations**:
✅ Config is YAML/JSON (loaded at startup, not runtime)
✅ No dynamic query construction

#### 6c. Log Injection
Inject newlines to forge log entries:
```
username: "admin\n[ERROR] Authentication failed for admin"
```

**Mitigations**:
✅ Structured logging (JSON)
✅ Field sanitization (escape special chars)

---

### 7. Information Disclosure
**Risk Level**: 🟡 MEDIUM

#### Attack
- Stack traces in error responses
- Debug endpoints in production
- Verbose error messages

#### Mitigations
✅ **Implemented**:
1. **Environment-based responses**:
   - Production: Generic errors (`"Internal Server Error"`)
   - Development: Full stack traces
2. **Health endpoint**: No sensitive info
3. **Header filtering**: Remove `X-Powered-By`, upstream headers

```javascript
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message
  });
});
```

---

### 8. Man-in-the-Middle (MitM)
**Risk Level**: 🟠 HIGH

#### Attack
Intercept traffic between proxy and upstream.

#### Mitigations
✅ **Implemented**:
1. **Enforce HTTPS** to upstream (configurable)
2. **Certificate validation** (reject self-signed in prod)
3. **TLS 1.2+ only**
4. **HSTS headers** (downstream)

#### What We Don't Do
- ❌ Certificate pinning → **Reason**: Operational complexity
- ❌ mTLS to upstream → **Future work**

---

## Threat Scenarios We Accept

### Compromised Upstream
**Scenario**: Backend service is compromised.

**Impact**: Proxy forwards malicious responses.

**Why We Accept**: 
- Backend is in trusted zone
- Proxy can't validate business logic
- **Mitigation**: Response size limits, timeout enforcement

### Config File Tampering
**Scenario**: Attacker modifies config files.

**Impact**: Complete compromise.

**Why We Accept**:
- Config is in trusted deployment pipeline
- File system access implies full compromise anyway
- **Mitigation**: Config validation on load, signature verification (future)

### Memory Exhaustion via Legitimate Traffic
**Scenario**: Spike in traffic causes OOM.

**Impact**: Crash and restart.

**Why We Accept**:
- Node.js memory model makes this hard to prevent
- **Mitigation**: Connection limits, k8s resource limits, circuit breaker

---

## Security Checklist (Pre-Deployment)

- [ ] All routes have explicit auth requirements
- [ ] Allowed hosts list is minimal
- [ ] Rate limits configured per route
- [ ] Secrets in env vars (not config files)
- [ ] HTTPS enforced to upstream
- [ ] Health endpoint doesn't leak info
- [ ] Logs don't contain PII/secrets
- [ ] Timeouts configured
- [ ] Error responses sanitized for production

---

## Incident Response

### If SSRF Detected
1. Identify target host from logs (correlation ID)
2. Add to `blockedIPs` immediately
3. Deploy updated config (< 5 min)
4. Review all requests from that client IP
5. Rotate API keys

### If DoS Detected
1. Enable rate limit override (stricter limits)
2. Add IP to block list
3. Scale horizontally if legitimate traffic
4. Check circuit breaker status

### If Auth Bypass Detected
1. Rotate all API keys immediately
2. Review auth logs for time window
3. Check for config errors
4. Deploy fix + re-auth all clients

---

## Future Work

1. **WAF Integration**: Integrate with ModSecurity/Coraza
2. **mTLS**: Mutual TLS to backend services
3. **Request Signing**: HMAC-signed request bodies
4. **Anomaly Detection**: ML-based traffic analysis
5. **Config Signing**: Cryptographically sign config files

---

## References
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE-918: SSRF](https://cwe.mitre.org/data/definitions/918.html)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
