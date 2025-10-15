import { Octokit } from '@octokit/rest';
import { CommitToPushInput, ReadGitHubFileInput } from '../types/index.js';
import { assertValidFilePath, assertValidBranchName, assertValidRepoId } from './path-validator.js';
import { auditLogger } from './audit-logger.js';
import { MCPError, ERROR_CODES, sanitizeErrorMessage } from '../middleware/error-handler.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export class GitHubManager {
  private tokenMap: Record<string, string>;
  private octokitCache: Map<string, Octokit> = new Map();

  constructor(tokenMap: Record<string, string>) {
    this.tokenMap = tokenMap;
  }

  /**
   * Get Octokit instance for a specific repository
   */
  private getOctokit(repoId: string): Octokit {
    assertValidRepoId(repoId, this.tokenMap);

    if (!this.octokitCache.has(repoId)) {
      const token = this.tokenMap[repoId];
      this.octokitCache.set(repoId, new Octokit({ auth: token }));
    }

    return this.octokitCache.get(repoId)!;
  }

  /**
   * Parse repository ID into owner and repo
   */
  private parseRepoId(repoId: string): { owner: string; repo: string } {
    const parts = repoId.split('/');
    if (parts.length !== 2) {
      throw new MCPError(
        ERROR_CODES.INVALID_REPO,
        'Repository ID must be in format "owner/repo"',
        400,
        false
      );
    }
    return { owner: parts[0], repo: parts[1] };
  }

  /**
   * Validate token has necessary permissions
   */
  async validateTokenPermissions(repoId: string): Promise<boolean> {
    try {
      const octokit = this.getOctokit(repoId);
      const { owner, repo } = this.parseRepoId(repoId);

      // Try to get repository info
      const { data } = await octokit.rest.repos.get({ owner, repo });

      // Check if token has push permissions
      if (!data.permissions?.push) {
        throw new MCPError(
          ERROR_CODES.PERMISSION_DENIED,
          'Token does not have push permissions for this repository',
          403,
          false
        );
      }

      // Verify it's using fine-grained token (not classic)
      const authResponse = await octokit.rest.users.getAuthenticated();
      logger.info({
        action: 'token_validated',
        repo: repoId,
        user: authResponse.data.login
      });

      return true;
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }

      throw new MCPError(
        ERROR_CODES.GITHUB_AUTH_FAILED,
        'Failed to validate GitHub token permissions',
        401,
        false
      );
    }
  }

  /**
   * Commit and push files to GitHub
   */
  async commitAndPush(
    input: CommitToPushInput,
    userId: string
  ): Promise<{ success: boolean; pr_url?: string; commit_sha?: string }> {
    const startTime = Date.now();

    try {
      // Validate repository
      assertValidRepoId(input.repo_id, this.tokenMap);

      // Validate branch name
      assertValidBranchName(input.branch);

      // Validate all file paths
      for (const filePath of Object.keys(input.files)) {
        assertValidFilePath(filePath);
      }

      const octokit = this.getOctokit(input.repo_id);
      const { owner, repo } = this.parseRepoId(input.repo_id);

      // Validate token permissions
      await this.validateTokenPermissions(input.repo_id);

      // Get the latest commit SHA for the branch
      let branchRef;
      try {
        branchRef = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${input.branch}`
        });
      } catch (error) {
        throw new MCPError(
          ERROR_CODES.INVALID_BRANCH,
          `Branch '${input.branch}' not found in repository`,
          404,
          false
        );
      }

      const latestCommitSha = branchRef.data.object.sha;

      // Get the tree for the latest commit
      const latestCommit = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: latestCommitSha
      });

      const baseTreeSha = latestCommit.data.tree.sha;

      // Create blobs for each file
      const tree: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];

      for (const [path, content] of Object.entries(input.files)) {
        const blob = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(content).toString('base64'),
          encoding: 'base64'
        });

        tree.push({
          path,
          mode: '100644',
          type: 'blob',
          sha: blob.data.sha
        });
      }

      // Create a new tree
      const newTree = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: baseTreeSha,
        tree
      });

      // Create a new commit
      const newCommit = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: input.commit_message,
        tree: newTree.data.sha,
        parents: [latestCommitSha]
      });

      // Update the reference
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${input.branch}`,
        sha: newCommit.data.sha
      });

      let prUrl: string | undefined;

      // Create PR if requested
      if (input.create_pr && input.pr_title) {
        const pr = await octokit.rest.pulls.create({
          owner,
          repo,
          title: input.pr_title,
          head: input.branch,
          base: 'main', // Fixed base branch
          body: `Automated PR created via MCP server\n\nCommit: ${input.commit_message}`
        });

        prUrl = pr.data.html_url;
      }

      const executionTime = Date.now() - startTime;

      auditLogger.log(
        userId,
        'commit_and_push',
        {
          repo_id: input.repo_id,
          branch: input.branch,
          file_count: Object.keys(input.files).length,
          create_pr: input.create_pr || false
        },
        'success',
        executionTime
      );

      logger.info({
        action: 'commit_pushed',
        repo: input.repo_id,
        branch: input.branch,
        commit_sha: newCommit.data.sha,
        pr_created: !!prUrl,
        userId
      });

      return {
        success: true,
        pr_url: prUrl,
        commit_sha: newCommit.data.sha
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      auditLogger.log(
        userId,
        'commit_and_push',
        { repo_id: input.repo_id, branch: input.branch },
        'failure',
        executionTime,
        sanitizeErrorMessage(errorMessage)
      );

      if (error instanceof MCPError) {
        throw error;
      }

      throw new MCPError(
        ERROR_CODES.GITHUB_AUTH_FAILED,
        'Failed to commit and push to GitHub',
        500,
        true
      );
    }
  }

  /**
   * Read a file from GitHub
   */
  async readFile(
    input: ReadGitHubFileInput,
    userId: string
  ): Promise<{ content: string; size: number }> {
    const startTime = Date.now();

    try {
      // Validate repository
      assertValidRepoId(input.repo_id, this.tokenMap);

      // Validate file path
      assertValidFilePath(input.file_path);

      const octokit = this.getOctokit(input.repo_id);
      const { owner, repo } = this.parseRepoId(input.repo_id);

      // Get file content
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: input.file_path,
        ref: input.branch
      });

      if (Array.isArray(response.data) || response.data.type !== 'file') {
        throw new MCPError(
          ERROR_CODES.INVALID_REPO,
          'Path does not point to a file',
          400,
          false
        );
      }

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      const size = response.data.size;

      const executionTime = Date.now() - startTime;

      auditLogger.log(
        userId,
        'read_github_file',
        {
          repo_id: input.repo_id,
          file_path: input.file_path,
          branch: input.branch
        },
        'success',
        executionTime
      );

      logger.info({
        action: 'file_read',
        repo: input.repo_id,
        file: input.file_path,
        size,
        userId
      });

      return { content, size };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      auditLogger.log(
        userId,
        'read_github_file',
        {
          repo_id: input.repo_id,
          file_path: input.file_path
        },
        'failure',
        executionTime,
        sanitizeErrorMessage(errorMessage)
      );

      if (error instanceof MCPError) {
        throw error;
      }

      throw new MCPError(
        ERROR_CODES.GITHUB_AUTH_FAILED,
        'Failed to read file from GitHub',
        500,
        true
      );
    }
  }
}
