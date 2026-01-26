# 🔒 Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | ✅ Active support  |
| < 1.0   | ❌ Not supported   |

---

## Reporting a Vulnerability

**We take security seriously.** If you discover a security vulnerability, please help us protect our users by following responsible disclosure.

### 🚨 **DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please follow these steps:

### **1. Private Disclosure**

Email security findings to:

**📧 security@flexgate.dev**

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (if you have one)

### **2. What to Expect**

| Timeline | Action |
|----------|--------|
| **24 hours** | We acknowledge receipt |
| **72 hours** | We confirm/triage the issue |
| **7 days** | We provide a fix timeline |
| **30 days** | We release a patch (or sooner) |

### **3. Coordinated Disclosure**

We follow a **90-day disclosure timeline**:

1. **Day 0:** You report the issue privately
2. **Day 1-7:** We investigate and confirm
3. **Day 7-30:** We develop and test a fix
4. **Day 30:** We release a patch
5. **Day 30+:** Public disclosure (coordinated with you)

If the issue is actively being exploited, we'll expedite the timeline.

---

## 🎯 Scope

### **In Scope:**

✅ **Code vulnerabilities:**
- Remote code execution (RCE)
- SQL injection
- Cross-site scripting (XSS)
- Authentication bypass
- Authorization flaws
- Denial of service (DoS)
- Information disclosure
- Insecure dependencies

✅ **Infrastructure vulnerabilities:**
- Docker container escapes
- Kubernetes misconfigurations
- Exposed secrets in configs

✅ **Design flaws:**
- SSRF vulnerabilities
- Insecure defaults
- Weak cryptography

### **Out of Scope:**

❌ Social engineering attacks  
❌ Physical attacks  
❌ DoS via resource exhaustion (we document limits)  
❌ Issues in third-party dependencies (report to maintainers)  
❌ Issues requiring physical access  
❌ Issues in outdated versions (< 1.0)

---

## 🏆 Recognition

We appreciate security researchers who help keep FlexGate safe!

### **Hall of Fame:**

Contributors who report valid vulnerabilities will be:
- Publicly acknowledged (if desired)
- Listed in our security Hall of Fame
- Mentioned in release notes
- Given credit in CVE disclosures

**Coming soon:** Bug bounty program for verified vulnerabilities.

---

## 🛡️ Security Best Practices

### **For Users:**

1. **Keep FlexGate Updated**
   ```bash
   # Check version
   npm list flexgate-proxy
   
   # Update to latest
   npm update flexgate-proxy
   ```

2. **Use Secrets Management**
   ```yaml
   # ❌ DON'T hardcode secrets
   redis:
     password: "supersecret123"
   
   # ✅ DO use environment variables
   redis:
     password: ${REDIS_PASSWORD}
   ```

3. **Enable Security Headers**
   ```yaml
   security:
     headers:
       strictTransportSecurity: true
       contentSecurityPolicy: true
       xFrameOptions: "DENY"
   ```

4. **Restrict Admin Endpoints**
   ```yaml
   admin:
     enabled: true
     allowedIPs:
       - "10.0.0.0/8"  # Internal only
   ```

5. **Monitor Logs**
   ```bash
   # Watch for suspicious activity
   kubectl logs -f deployment/flexgate | grep -i "error\|unauthorized"
   ```

---

## 🔍 Security Features

FlexGate includes built-in security features:

### **SSRF Protection**
- IP blacklist for private networks
- Host allowlist for upstreams
- URL validation

### **Rate Limiting**
- Distributed rate limiting (Redis)
- Per-route limits
- IP-based throttling

### **Input Validation**
- Header size limits
- Request body size limits
- Path traversal prevention

### **Observability**
- Structured security logs
- Failed auth attempts logged
- Correlation IDs for tracking

See [docs/threat-model.md](docs/threat-model.md) for full security analysis.

---

## 📜 Security Advisories

We publish security advisories for all confirmed vulnerabilities:

- **GitHub Security Advisories:** [github.com/tapas100/flexgate-proxy/security/advisories](https://github.com/tapas100/flexgate-proxy/security/advisories)
- **CVE Database:** We request CVEs for high/critical issues
- **Mailing List:** Subscribe at [security@flexgate.dev]

---

## 🔐 Cryptography

FlexGate uses industry-standard cryptography:

- **TLS:** 1.2+ only (configurable)
- **Cipher Suites:** Strong ciphers only
- **Secrets:** Stored encrypted (when using Pro features)
- **Hashing:** bcrypt for passwords (Pro features)

We do **not** implement custom cryptography. We rely on:
- Node.js `crypto` module
- OpenSSL (for TLS)
- Established libraries

---

## 🚨 Past Vulnerabilities

**None reported yet.** We'll list all confirmed vulnerabilities here.

---

## 📞 Contact

**Security Team:**
- **Email:** security@flexgate.dev
- **PGP Key:** [Coming soon]
- **Response Time:** Within 24 hours

**General Issues:**
- **GitHub Issues:** For non-security bugs
- **Discussions:** For questions

---

## 🙏 Thank You

Thank you for helping keep FlexGate and our users safe!

**Responsible disclosure protects everyone:**
- Users get patches before exploits
- We can fix issues properly
- Public disclosure is coordinated
- Everyone benefits

---

**Last Updated:** January 26, 2026  
**Policy Version:** 1.0
