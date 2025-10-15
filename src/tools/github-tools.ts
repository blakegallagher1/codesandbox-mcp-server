import {
  CommitToPushInputSchema,
  ReadGitHubFileInputSchema
} from '../types/index.js';
import { validateInput } from '../middleware/validation.js';
import { GitHubManager } from '../services/github-manager.js';
import { RateLimiter } from '../services/rate-limiter.js';
import { config } from '../services/config.js';
import { auditLogger } from '../services/audit-logger.js';
import { MCPError, ERROR_CODES } from '../middleware/error-handler.js';

// Initialize services
const githubManager = new GitHubManager(config.get('github_token_map'));
const rateLimiter = new RateLimiter(config.get('rate_limit_per_minute'));

/**
 * Tool 4: Commit and push to GitHub
 */
export async function commit_and_push_to_github(
  params: unknown,
  userId: string = 'default_user'
): Promise<{ success: boolean; pr_url?: string; commit_sha?: string }> {
  const startTime = Date.now();

  try {
    // Validate input
    const input = validateInput(CommitToPushInputSchema, params);

    // Check rate limits
    rateLimiter.checkLimit(userId, 'free', 'api_call');

    // Commit and push
    const result = await githubManager.commitAndPush(input, userId);

    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;

    if (error instanceof MCPError && error.code === ERROR_CODES.RATE_LIMIT_EXCEEDED) {
      auditLogger.log(
        userId,
        'commit_and_push_to_github',
        params as Record<string, unknown>,
        'rate_limited',
        executionTime,
        error.message
      );
    }

    throw error;
  }
}

/**
 * Tool 5: Read GitHub file
 */
export async function read_github_file(
  params: unknown,
  userId: string = 'default_user'
): Promise<{ content: string; size: number; file_path: string }> {
  const startTime = Date.now();

  try {
    // Validate input
    const input = validateInput(ReadGitHubFileInputSchema, params);

    // Check rate limits (read-only, but still rate-limited)
    rateLimiter.checkLimit(userId, 'free', 'api_call');

    // Read file
    const result = await githubManager.readFile(
      {
        repo_id: input.repo_id,
        file_path: input.file_path,
        branch: input.branch || 'main'
      },
      userId
    );

    return {
      ...result,
      file_path: input.file_path
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;

    if (error instanceof MCPError && error.code === ERROR_CODES.RATE_LIMIT_EXCEEDED) {
      auditLogger.log(
        userId,
        'read_github_file',
        params as Record<string, unknown>,
        'rate_limited',
        executionTime,
        error.message
      );
    }

    throw error;
  }
}

// Export tool definitions for MCP server
export const githubTools = [
  {
    name: 'commit_and_push_to_github',
    description: 'Commit and push files to a GitHub repository with optional PR creation',
    inputSchema: {
      type: 'object',
      properties: {
        repo_id: {
          type: 'string',
          description: 'Repository ID in format "owner/repo" (must be in allowed list)'
        },
        branch: {
          type: 'string',
          description: 'Branch name (alphanumeric, dots, underscores, slashes, hyphens)'
        },
        files: {
          type: 'object',
          description: 'Files to commit (max 10 files, 500KB each)',
          additionalProperties: { type: 'string' }
        },
        commit_message: {
          type: 'string',
          description: 'Commit message (1-200 chars)',
          minLength: 1,
          maxLength: 200
        },
        create_pr: {
          type: 'boolean',
          description: 'Whether to create a pull request'
        },
        pr_title: {
          type: 'string',
          description: 'PR title (max 100 chars)',
          maxLength: 100
        }
      },
      required: ['repo_id', 'branch', 'files', 'commit_message']
    },
    handler: commit_and_push_to_github
  },
  {
    name: 'read_github_file',
    description: 'Read a file from a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        repo_id: {
          type: 'string',
          description: 'Repository ID in format "owner/repo" (must be in allowed list)'
        },
        file_path: {
          type: 'string',
          description: 'Path to the file (relative, no traversal allowed)'
        },
        branch: {
          type: 'string',
          description: 'Branch name (defaults to "main")',
          default: 'main'
        }
      },
      required: ['repo_id', 'file_path']
    },
    handler: read_github_file
  }
];
