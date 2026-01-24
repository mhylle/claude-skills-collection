# Security Review Checklist

Comprehensive security checklist for code reviews and security audits.

---

## 1. Secrets Management Checklist

- [ ] No hardcoded API keys, tokens, or passwords in source code
- [ ] All secrets stored in environment variables
- [ ] .env files in .gitignore
- [ ] No secrets in git history (use git-secrets or similar)
- [ ] Production secrets in secure hosting platform
- [ ] Secrets rotated regularly
- [ ] Different secrets for dev/staging/production

---

## 2. Input Validation Checklist

- [ ] All user inputs validated with schemas (zod, joi, yup)
- [ ] File uploads restricted by size, type, and extension
- [ ] No direct use of user input in queries or commands
- [ ] Whitelist validation preferred over blacklist
- [ ] Error messages don't leak sensitive information
- [ ] Path traversal attacks prevented
- [ ] URL validation for redirects

---

## 3. SQL Injection Prevention Checklist

- [ ] All database queries use parameterized queries
- [ ] No string concatenation in SQL statements
- [ ] ORM/query builder used correctly
- [ ] Stored procedures use parameters
- [ ] Database user has minimal required permissions

---

## 4. Authentication & Authorization Checklist

- [ ] Tokens stored in httpOnly cookies (not localStorage)
- [ ] Secure and SameSite flags on cookies
- [ ] Authorization checks before all sensitive operations
- [ ] Role-based access control implemented
- [ ] Row Level Security enabled (if using Supabase)
- [ ] Session timeout implemented
- [ ] Password requirements enforced
- [ ] Multi-factor authentication available

---

## 5. XSS Prevention Checklist

- [ ] User-provided HTML sanitized (DOMPurify)
- [ ] Content Security Policy headers configured
- [ ] No unvalidated dynamic content in innerHTML
- [ ] Framework XSS protection enabled (React, etc.)
- [ ] User input escaped in templates
- [ ] No eval() or Function() with user data

---

## 6. CSRF Protection Checklist

- [ ] CSRF tokens on all state-changing operations
- [ ] SameSite=Strict on session cookies
- [ ] Double-submit cookie pattern implemented
- [ ] Origin header validated
- [ ] Custom headers required for API calls

---

## 7. Rate Limiting Checklist

- [ ] Rate limiting on all API endpoints
- [ ] Stricter limits on auth endpoints
- [ ] Stricter limits on expensive operations
- [ ] IP-based rate limiting
- [ ] User-based rate limiting for authenticated users
- [ ] Appropriate error responses (429 Too Many Requests)

---

## 8. Sensitive Data Exposure Checklist

- [ ] No passwords, tokens, or secrets in logs
- [ ] Error messages generic for users
- [ ] Detailed errors only in server logs
- [ ] No stack traces exposed to users
- [ ] PII handled according to regulations
- [ ] Data encrypted at rest and in transit
- [ ] Secure deletion of sensitive data

---

## 9. Blockchain Security Checklist (if applicable)

- [ ] Wallet signatures verified before actions
- [ ] Transaction details validated
- [ ] Balance checks before transactions
- [ ] No blind transaction signing
- [ ] Smart contract interactions validated
- [ ] Replay attack protection

---

## 10. Dependency Security Checklist

- [ ] Dependencies up to date
- [ ] No known vulnerabilities (npm audit clean)
- [ ] Lock files committed (package-lock.json)
- [ ] Dependabot or similar enabled
- [ ] Regular security updates scheduled
- [ ] Unused dependencies removed

---

## Quick Scan Commands

Common security checks that can be run from the command line.

### Secrets Detection

```bash
# Search for potential hardcoded secrets
grep -rE "(api[_-]?key|apikey|secret|password|token|credential)" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" . | grep -v node_modules | grep -v ".test." | grep -v ".spec."

# Search for AWS keys pattern
grep -rE "AKIA[0-9A-Z]{16}" . --include="*.ts" --include="*.js" | grep -v node_modules

# Search for private keys
grep -rE "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----" . | grep -v node_modules

# Check if .env is in .gitignore
grep -q "^\.env" .gitignore && echo "OK: .env in .gitignore" || echo "WARNING: .env not in .gitignore"
```

### SQL Injection Detection

```bash
# Find potential SQL injection vulnerabilities (string concatenation in queries)
grep -rE "(\$\{|\" \+|\+ \").*?(SELECT|INSERT|UPDATE|DELETE|WHERE)" --include="*.ts" --include="*.js" . | grep -v node_modules

# Find raw SQL queries without parameterization
grep -rE "\.query\s*\(\s*['\`\"]" --include="*.ts" --include="*.js" . | grep -v node_modules
```

### XSS Detection

```bash
# Find dangerous innerHTML usage
grep -rE "innerHTML\s*=" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules

# Find eval usage
grep -rE "\beval\s*\(" --include="*.ts" --include="*.js" . | grep -v node_modules

# Find dangerouslySetInnerHTML usage
grep -rE "dangerouslySetInnerHTML" --include="*.tsx" --include="*.jsx" . | grep -v node_modules
```

### Authentication Checks

```bash
# Find localStorage token storage (potential security issue)
grep -rE "localStorage\.(setItem|getItem).*token" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules

# Check for missing authorization headers
grep -rE "fetch\(|axios\." --include="*.ts" --include="*.tsx" . | grep -v node_modules | head -20
```

### Dependency Audit

```bash
# NPM security audit
npm audit

# Check for outdated packages
npm outdated

# List packages with known vulnerabilities
npm audit --json | jq '.vulnerabilities | keys[]'
```

### Rate Limiting Check

```bash
# Find API routes without rate limiting middleware
grep -rE "(app\.(get|post|put|delete|patch)|router\.(get|post|put|delete|patch))" --include="*.ts" --include="*.js" . | grep -v node_modules | grep -v "rateLimit"
```

### File Upload Security

```bash
# Find file upload handlers
grep -rE "(multer|upload|formidable|busboy)" --include="*.ts" --include="*.js" . | grep -v node_modules

# Check for file type validation
grep -rE "mimetype|fileFilter|accept=" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```

### Environment Variables

```bash
# List all environment variable usage
grep -rE "process\.env\." --include="*.ts" --include="*.js" . | grep -v node_modules | sort -u

# Check for .env.example file
[ -f .env.example ] && echo "OK: .env.example exists" || echo "WARNING: No .env.example file"
```

---

## Severity Levels

When reporting findings, use these severity levels:

| Level | Description | Action Required |
|-------|-------------|-----------------|
| **CRITICAL** | Immediate exploitation possible, data breach risk | Block deployment, fix immediately |
| **HIGH** | Significant vulnerability, requires specific conditions | Fix before next release |
| **MEDIUM** | Security weakness, defense-in-depth issue | Fix within sprint |
| **LOW** | Minor issue, best practice violation | Add to backlog |
| **INFO** | Observation, no immediate risk | Document for awareness |

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
