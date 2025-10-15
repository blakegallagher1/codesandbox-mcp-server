# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in this project, please report it responsibly:

**Email:** security@your-domain.com

**Please include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Response Time:** We aim to respond to security reports within 48 hours.

## Threat Model

This MCP server operates under the assumption that **ChatGPT/Claude are untrusted adversaries**. All security controls are designed with this threat model in mind.

### Key Security Assumptions

1. **Input Validation:** All user inputs are potentially malicious
2. **Least Privilege:** Whitelist-based permissions only
3. **Audit Logging:** Immutable append-only logs for all operations
4. **Error Sanitization:** Never leak secrets, tokens, or internal paths
5. **Rate Limiting:** Per-user quotas enforced at multiple levels

### Protected Assets

- **CodeSandbox API Keys:** Never logged or exposed in errors
- **GitHub Fine-Grained PATs:** Scoped to specific repositories only
- **Audit Logs:** Tamper-proof with SHA256 integrity hashes
- **File System:** Path traversal prevention on all file operations
- **Repository Access:** Whitelist-only, no dynamic repository access

### Attack Vectors Mitigated

1. **Path Traversal:** All file paths validated against regex and forbidden list
2. **Credential Leakage:** All errors and logs sanitized
3. **Token Theft:** GitHub tokens are fine-grained PATs with minimal scopes
4. **Rate Limit Bypass:** Multi-tier rate limiting (per minute, per hour, per day)
5. **Resource Exhaustion:** File size limits, sandbox TTL, execution time quotas
6. **Repository Hijacking:** Whitelist-only repository access
7. **Branch Confusion:** Branch names validated against strict regex

## Security Controls

### Input Validation (Zod Schemas)

All inputs are validated using Zod schemas before execution:
- File paths: regex validation + forbidden path blacklist
- Branch names: alphanumeric, dots, underscores, slashes only
- Repository IDs: must exist in allowlist
- File sizes: hard limits enforced (500KB for GitHub, 1MB for sandboxes)
- Commit messages: length limits (200 chars)

### Rate Limiting & Quotas

**Free Tier:**
- 10 API calls per minute
- 5 sandboxes per hour
- 1 hour execution time per day

**Pro Tier:**
- 100 API calls per minute
- 100 sandboxes per hour
- 24 hours execution time per day

### Audit Logging

All operations are logged to an immutable SQLite database with:
- Timestamp (ISO 8601)
- User ID
- Tool name
- Sanitized parameters
- Result (success/failure/rate_limited)
- Execution time
- SHA256 integrity hash

Logs are append-only and cannot be modified after creation.

### Error Sanitization

All error messages passed to clients are sanitized:
- Tokens replaced with `[REDACTED]`
- API keys replaced with `[REDACTED]`
- File paths replaced with `/[USER]/`
- Messages truncated to 200 characters max

### GitHub Token Security

**Requirements:**
- Must use fine-grained Personal Access Tokens (PATs)
- Classic tokens are not supported
- Tokens must have minimal scopes:
  - `contents: read/write` (for specific repositories only)
  - `pull_requests: write` (if PR creation is needed)

**Token Rotation:**
- Fine-grained PATs expire after 90 days
- Set calendar reminders to rotate tokens before expiration

### Sandbox Security

**Resource Limits:**
- 512MB RAM per sandbox
- 50% CPU allocation
- 2-minute execution timeout
- 1-hour TTL (auto-destroy)

**File Restrictions:**
- Cannot write to `.env`, `.git`, `node_modules`, `.ssh`, `.aws`
- Cannot use absolute paths
- Cannot use path traversal (`..`)

## Known Limitations

### Current Limitations

1. **Token Expiration:** Fine-grained PATs expire after 90 days and require manual rotation
2. **Organization Access:** No support for organization-level GitHub access (repository-specific only)
3. **Sandbox Persistence:** Sandboxes auto-destroy after 1 hour
4. **Classic Tokens:** Classic GitHub tokens are not supported (fine-grained PATs only)
5. **Multi-Tenancy:** User isolation is basic (production would need stronger RBAC)

### Future Improvements

- [ ] Add OAuth flow for GitHub authentication
- [ ] Implement organization-level repository access
- [ ] Add support for GitHub Apps (instead of PATs)
- [ ] Integrate with secret management service (HashiCorp Vault, AWS Secrets Manager)
- [ ] Add webhooks for security alerts
- [ ] Implement real-time rate limit monitoring dashboard
- [ ] Add support for custom sandbox resource limits per user

## Deployment Security

### Docker Security

- Non-root user (`nodejs:nodejs`)
- Read-only file system (except `/app/logs`)
- No privileged mode
- Health checks enabled
- Restart policy: `unless-stopped`

### Environment Variables

**Required:**
- `CSB_API_KEY` - CodeSandbox API key
- `CSB_WORKSPACE_ID` - CodeSandbox workspace ID
- `CSB_GITHUB_TOKEN_REPO_*` - Fine-grained PATs for each repository

**Never commit:**
- `.env` files
- API keys or tokens
- Production credentials

### Network Security

- Use private networks for container communication
- Expose only necessary ports (default: 3000)
- Use TLS for all external communication (configure reverse proxy)

## Compliance

### Data Handling

- **PII:** No personally identifiable information is stored (except user IDs)
- **Audit Logs:** Stored locally in SQLite (consider external log aggregation for production)
- **Data Retention:** Audit logs retained indefinitely (implement rotation policy for production)

### GDPR Considerations

- User audit logs can be exported on request
- User data can be deleted on request (implement GDPR right-to-deletion)

## Security Testing

Run security tests:

```bash
npm run test:security
```

This runs:
1. `npm audit` - Check for vulnerable dependencies
2. `snyk test` - Deep security vulnerability scan
3. Security-specific unit tests

## Security Checklist

Before deploying to production:

- [ ] All dependencies audited (`npm audit`)
- [ ] Snyk scan passed (`snyk test`)
- [ ] All tests passing (>80% coverage)
- [ ] Environment variables configured (no defaults)
- [ ] GitHub tokens are fine-grained PATs
- [ ] Repository allowlist configured
- [ ] Rate limits appropriate for usage tier
- [ ] Audit logging enabled
- [ ] Error sanitization tested
- [ ] Docker image scanned for vulnerabilities
- [ ] TLS enabled (reverse proxy)
- [ ] Secrets not committed to git

## Contact

For security inquiries: security@your-domain.com

For general support: support@your-domain.com
