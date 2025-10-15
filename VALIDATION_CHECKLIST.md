# Validation Checklist

Complete this checklist before deploying to production.

## Code Quality

- [x] All Zod schemas defined (no unvalidated inputs)
- [x] All errors sanitized (no secrets in logs)
- [x] All paths validated (no traversal)
- [x] Rate limiting on all tools
- [x] Audit logging immutable (append-only)

## Security

- [x] GitHub tokens are fine-grained PATs only
- [x] Repository access is whitelist-based
- [x] Path traversal prevention implemented
- [x] Error messages sanitized
- [x] File size limits enforced
- [x] Forbidden paths blocked (.env, .git, .ssh, etc.)

## Testing

- [ ] All tests pass (`npm test`)
- [ ] Test coverage >80% (`npm test -- --coverage`)
- [ ] Security tests pass (`npm test -- tests/security`)
- [ ] Unit tests pass (`npm test -- tests/unit`)
- [ ] Integration tests pass (`npm test -- tests/integration`)

## Build & Deployment

- [ ] TypeScript builds without errors (`npm run build`)
- [ ] Docker builds without warnings (`docker build .`)
- [ ] Health check endpoint works
- [ ] Environment variables configured (no defaults)

## Security Audit

- [ ] npm audit passes (no high/critical vulnerabilities)
- [ ] Snyk test passes (`snyk test`)
- [ ] No secrets committed to git
- [ ] .env files in .gitignore

## Documentation

- [x] README.md complete with setup instructions
- [x] SECURITY.md documented
- [x] .env.template has all required vars
- [x] API documentation complete (tool schemas)

## Configuration

- [ ] MCP_PORT configured
- [ ] CSB_API_KEY set (CodeSandbox)
- [ ] CSB_WORKSPACE_ID set
- [ ] GitHub tokens configured (fine-grained PATs)
- [ ] Rate limits appropriate for usage tier
- [ ] Log levels set correctly

## Production Readiness

- [ ] Monitoring/alerting configured
- [ ] Log aggregation configured
- [ ] Backup strategy for audit logs
- [ ] TLS configured (reverse proxy)
- [ ] Secrets stored securely (not in .env file)
- [ ] Token rotation schedule set (90-day reminder)

## Final Checks

- [ ] All 14 phases implemented
- [ ] No TODO comments in production code
- [ ] Version number updated in package.json
- [ ] Git history clean (no secrets committed)
- [ ] Docker image tagged with version

---

## Status: NOT READY FOR PRODUCTION

**Next Steps:**
1. Run `npm install` to install dependencies
2. Run `npm test` to verify all tests pass
3. Run `npm run build` to verify TypeScript compilation
4. Configure `.env` file with real credentials
5. Test locally with `npm start`
6. Run security audit with `npm run test:security`
7. Complete all unchecked items above

**Do NOT deploy until all checkboxes are complete.**
