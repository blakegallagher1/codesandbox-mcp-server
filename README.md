# CodeSandbox MCP Server

A production-ready, security-hardened Model Context Protocol (MCP) server that connects Claude/ChatGPT to CodeSandbox and GitHub APIs.

**Security First:** Built with the assumption that ChatGPT/Claude are untrusted adversaries. Every input is validated, every operation is logged, and every error is sanitized.

## Features

- **CodeSandbox Integration:** Create sandboxes, write files, retrieve outputs
- **GitHub Integration:** Commit/push files, create PRs, read files (fine-grained PAT support)
- **Security Hardened:** Input validation, path traversal prevention, error sanitization
- **Rate Limiting:** Multi-tier quotas (API calls, sandboxes, execution time)
- **Audit Logging:** Immutable append-only logs with SHA256 integrity hashes
- **Docker Ready:** Non-root container, health checks, graceful shutdown

## Quick Start

### 1. Prerequisites

- Node.js 20.x
- npm 10.x
- Docker & Docker Compose (optional)
- CodeSandbox API key
- GitHub fine-grained Personal Access Tokens (PATs)

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy `.env.template` to `.env`:

```bash
cp .env.template .env
```

Edit `.env` with your credentials:

```env
MCP_PORT=3000
CSB_API_KEY=your_codesandbox_api_token_here
CSB_WORKSPACE_ID=your_workspace_id
CSB_GITHUB_TOKEN_REPO_1=github_pat_xxx  # For owner1/repo1
CSB_GITHUB_TOKEN_REPO_2=github_pat_yyy  # For owner2/repo2
RATE_LIMIT_PER_MINUTE=10
SANDBOX_IDLE_TIMEOUT_MS=600000
MAX_SANDBOX_AGE_MS=3600000
LOG_LEVEL=info
AUDIT_LOG_LEVEL=info
```

**Important:** GitHub tokens must be **fine-grained PATs**, not classic tokens. See [Creating Fine-Grained PATs](#creating-fine-grained-pats) below.

### 4. Build & Run

#### Option A: Local Development

```bash
npm run build
npm start
```

#### Option B: Docker

```bash
docker-compose up -d
```

### 5. Verify

Check health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "uptime": "45 seconds",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "services": {
    "codesandbox": "connected",
    "github": "connected"
  }
}
```

## Creating Fine-Grained PATs

GitHub fine-grained Personal Access Tokens provide repository-specific permissions (recommended over classic tokens).

### Step-by-Step Instructions

1. Go to GitHub Settings → Developer settings → Personal access tokens → **Fine-grained tokens**
2. Click **Generate new token**
3. Configure token:
   - **Name:** `MCP Server - owner/repo`
   - **Expiration:** 90 days (max)
   - **Repository access:** Select specific repositories
   - **Permissions:**
     - `Contents`: Read and write
     - `Pull requests`: Read and write (if creating PRs)
4. Click **Generate token** and copy it immediately
5. Add to `.env`:
   ```
   CSB_GITHUB_TOKEN_REPO_1=github_pat_xxxxxxxxxxxxx
   ```

**Note:** Fine-grained PATs expire after 90 days. Set a calendar reminder to rotate tokens.

### Token Naming Convention

Use environment variable names matching this pattern:
- `CSB_GITHUB_TOKEN_REPO_1` → Maps to first repo configured
- `CSB_GITHUB_TOKEN_REPO_2` → Maps to second repo configured

The server extracts repository keys from variable names (e.g., `repo_1`, `repo_2`).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude/ChatGPT                          │
└────────────────────────┬────────────────────────────────────┘
                         │ MCP Protocol (stdio)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   MCP Server (this)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Validation  │  │ Rate Limiter │  │ Audit Logger │     │
│  │  (Zod)       │  │              │  │ (SQLite)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌────────────────────────────────────────────────────┐   │
│  │              Tool Handlers                          │   │
│  │  • create_sandbox_for_project                      │   │
│  │  • write_files_to_sandbox                          │   │
│  │  • get_sandbox_output                              │   │
│  │  • commit_and_push_to_github                       │   │
│  │  • read_github_file                                │   │
│  └────────────────────────────────────────────────────┘   │
└────────────┬───────────────────────────┬────────────────────┘
             │                           │
             ▼                           ▼
   ┌──────────────────┐       ┌──────────────────┐
   │ CodeSandbox API  │       │   GitHub API     │
   │  (sandboxes)     │       │ (fine-grained)   │
   └──────────────────┘       └──────────────────┘
```

## Available Tools

### CodeSandbox Tools

#### 1. `create_sandbox_for_project`

Create a new CodeSandbox with a specified template.

**Parameters:**
- `project_name` (string): 1-50 chars, alphanumeric/underscore/hyphen only
- `template` (enum): `react`, `next`, `vue`, `node`
- `initial_files` (object, optional): Max 20 files, 1MB each

**Returns:**
- `sandbox_id` (UUID)
- `preview_url` (string)

**Example:**
```json
{
  "project_name": "my-react-app",
  "template": "react",
  "initial_files": {
    "src/App.tsx": "export default function App() { return <div>Hello</div>; }"
  }
}
```

#### 2. `write_files_to_sandbox`

Write or update files in an existing sandbox.

**Parameters:**
- `sandbox_id` (UUID)
- `files` (object): Max 10 files, 500KB each

**Returns:**
- `success` (boolean)
- `files_written` (number)

#### 3. `get_sandbox_output`

Retrieve console logs, build output, or preview URL.

**Parameters:**
- `sandbox_id` (UUID)
- `output_type` (enum): `console_log`, `build_output`, `preview_url`

**Returns:**
- `output` (string): Sanitized output (max 50KB)
- `output_type` (string)

### GitHub Tools

#### 4. `commit_and_push_to_github`

Commit and push files to a GitHub repository.

**Parameters:**
- `repo_id` (string): Format `owner/repo` (must be in allowlist)
- `branch` (string): Branch name (no `..` or `//`)
- `files` (object): Max 10 files, 500KB each
- `commit_message` (string): 1-200 chars
- `create_pr` (boolean, optional): Create a pull request
- `pr_title` (string, optional): PR title (max 100 chars)

**Returns:**
- `success` (boolean)
- `pr_url` (string, optional)
- `commit_sha` (string)

**Example:**
```json
{
  "repo_id": "owner/repo",
  "branch": "feature/new-feature",
  "files": {
    "README.md": "# Updated README"
  },
  "commit_message": "Update README with new instructions",
  "create_pr": true,
  "pr_title": "Update README"
}
```

#### 5. `read_github_file`

Read a file from a GitHub repository.

**Parameters:**
- `repo_id` (string): Format `owner/repo` (must be in allowlist)
- `file_path` (string): Relative path (no `..` or absolute paths)
- `branch` (string, optional): Defaults to `main`

**Returns:**
- `content` (string)
- `size` (number)
- `file_path` (string)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_PORT` | No | 3000 | Server port |
| `CSB_API_KEY` | Yes | - | CodeSandbox API key |
| `CSB_WORKSPACE_ID` | Yes | - | CodeSandbox workspace ID |
| `CSB_GITHUB_TOKEN_REPO_*` | Yes | - | Fine-grained PATs (one per repo) |
| `RATE_LIMIT_PER_MINUTE` | No | 10 | API calls per minute |
| `SANDBOX_IDLE_TIMEOUT_MS` | No | 600000 | 10 minutes |
| `MAX_SANDBOX_AGE_MS` | No | 3600000 | 1 hour |
| `LOG_LEVEL` | No | info | Pino log level |
| `AUDIT_LOG_LEVEL` | No | info | Audit log level |

## Development

### Scripts

- `npm run build` - Compile TypeScript
- `npm test` - Run all tests
- `npm run test:security` - Run security audit + tests
- `npm run lint` - Lint code with ESLint
- `npm start` - Start production server
- `npm run dev` - Start development server with ts-node

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm test -- tests/unit

# Security tests only
npm test -- tests/security

# With coverage
npm test -- --coverage
```

Coverage thresholds:
- Lines: 80%
- Branches: 75%
- Functions: 80%

## Security Considerations

### Threat Model

This server assumes **ChatGPT/Claude are untrusted adversaries**. All security controls are designed accordingly.

### Key Security Features

1. **Input Validation:** All inputs validated with Zod schemas
2. **Path Traversal Prevention:** Regex + blacklist validation on all file paths
3. **Error Sanitization:** Secrets/tokens removed from all error messages
4. **Audit Logging:** Immutable logs with SHA256 integrity hashes
5. **Rate Limiting:** Per-user quotas at multiple levels
6. **Repository Allowlist:** Only whitelisted repos accessible
7. **Fine-Grained PATs:** GitHub tokens scoped to specific repositories

### What Gets Blocked

- Path traversal attempts (`../`, `/etc/passwd`)
- Absolute paths (`/`, `C:\`)
- Forbidden directories (`.env`, `.git`, `.ssh`, `.aws`)
- Oversized files (>500KB for GitHub, >1MB for sandboxes)
- Non-whitelisted repositories
- Invalid branch names (spaces, `..`, `//`)
- Rate limit violations

See [SECURITY.md](./SECURITY.md) for complete security documentation.

## Troubleshooting

### Issue: "Failed to load configuration"

**Cause:** Missing or invalid environment variables

**Solution:**
1. Check `.env` file exists
2. Verify all required variables are set
3. Ensure no trailing spaces in values

### Issue: "INVALID_REPO" error

**Cause:** Repository not in allowlist

**Solution:**
1. Add token to `.env`: `CSB_GITHUB_TOKEN_REPO_3=github_pat_xxx`
2. Restart server
3. Use repo ID matching the token (e.g., `repo_3`)

### Issue: "RATE_LIMIT_EXCEEDED"

**Cause:** Too many API calls

**Solution:**
1. Wait for rate limit window to reset (shown in error message)
2. Reduce request frequency
3. Upgrade to pro tier (if available)

### Issue: "PATH_TRAVERSAL" error

**Cause:** Invalid file path in request

**Solution:**
- Use relative paths only (e.g., `src/index.ts`)
- Avoid `..`, `/`, or forbidden directories
- Check path doesn't start with `.env`, `.git`, etc.

### Issue: Health check fails

**Cause:** Configuration or connectivity issue

**Solution:**
1. Check server logs: `docker-compose logs -f`
2. Verify API keys are valid
3. Test network connectivity to CodeSandbox/GitHub

## Production Deployment

### Pre-Deployment Checklist

- [ ] All tests passing (`npm test`)
- [ ] Security audit clean (`npm run test:security`)
- [ ] Environment variables configured (no defaults)
- [ ] GitHub tokens are fine-grained PATs
- [ ] Repository allowlist configured
- [ ] Rate limits appropriate for load
- [ ] TLS configured (reverse proxy)
- [ ] Monitoring/alerting set up
- [ ] Log aggregation configured
- [ ] Backup strategy for audit logs

### Recommended Stack

- **Reverse Proxy:** Nginx or Traefik (for TLS termination)
- **Monitoring:** Prometheus + Grafana
- **Log Aggregation:** ELK Stack or Datadog
- **Secret Management:** HashiCorp Vault or AWS Secrets Manager
- **Container Orchestration:** Docker Swarm or Kubernetes

### Docker Production Config

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  mcp-server:
    image: codesandbox-mcp-server:1.0.0
    restart: always
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=warn
      - AUDIT_LOG_LEVEL=info
    volumes:
      - /var/log/mcp:/app/logs
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 512M
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Run security audit
6. Submit a pull request

**Security Issues:** Report privately to security@your-domain.com

## License

MIT License - See [LICENSE](./LICENSE) file for details

## Support

- **Documentation:** [SECURITY.md](./SECURITY.md)
- **Issues:** GitHub Issues
- **Email:** support@your-domain.com

## Acknowledgments

- Built with [@modelcontextprotocol/sdk](https://github.com/anthropics/mcp)
- CodeSandbox API integration
- GitHub REST API via Octokit
- Security design inspired by OWASP Top 10

---

**⚠️ Important:** Do NOT deploy to production until all security tests pass and the validation checklist is complete. See [SECURITY.md](./SECURITY.md) for deployment requirements.
