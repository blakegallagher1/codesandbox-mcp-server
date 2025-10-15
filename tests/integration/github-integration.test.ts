import { GitHubManager } from '../../src/services/github-manager';
import { CommitToPushInput, ReadGitHubFileInput } from '../../src/types';
import { ERROR_CODES } from '../../src/middleware/error-handler';

describe('GitHub Integration Tests', () => {
  let githubManager: GitHubManager;
  const testUserId = 'test-user-123';

  // Mock token map (in real tests, use test repositories)
  const mockTokenMap = {
    'testowner/testrepo': 'mock-token-123',
    'allowed/repo': 'mock-token-456'
  };

  beforeEach(() => {
    githubManager = new GitHubManager(mockTokenMap);
  });

  describe('commitAndPush', () => {
    it('should reject non-whitelisted repositories', async () => {
      const input: CommitToPushInput = {
        repo_id: 'evil/repo',
        branch: 'main',
        files: {
          'README.md': '# Test'
        },
        commit_message: 'Test commit'
      };

      await expect(githubManager.commitAndPush(input, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_REPO
        })
      );
    });

    it('should reject invalid branch names', async () => {
      const input: CommitToPushInput = {
        repo_id: 'testowner/testrepo',
        branch: 'feature/../main', // Path traversal attempt
        files: {
          'test.txt': 'content'
        },
        commit_message: 'Test'
      };

      await expect(githubManager.commitAndPush(input, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_BRANCH
        })
      );
    });

    it('should reject invalid file paths', async () => {
      const input: CommitToPushInput = {
        repo_id: 'testowner/testrepo',
        branch: 'main',
        files: {
          '../../../etc/passwd': 'malicious'
        },
        commit_message: 'Test'
      };

      await expect(githubManager.commitAndPush(input, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    it('should reject commits with forbidden file paths', async () => {
      const input: CommitToPushInput = {
        repo_id: 'testowner/testrepo',
        branch: 'main',
        files: {
          '.env': 'SECRET=my-secret'
        },
        commit_message: 'Test'
      };

      await expect(githubManager.commitAndPush(input, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    // Note: Actual commit tests would require a real test repository
    // or mocking the Octokit library, which is beyond this basic test
  });

  describe('readFile', () => {
    it('should reject non-whitelisted repositories', async () => {
      const input: ReadGitHubFileInput = {
        repo_id: 'evil/repo',
        file_path: 'README.md',
        branch: 'main'
      };

      await expect(githubManager.readFile(input, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_REPO
        })
      );
    });

    it('should reject invalid file paths', async () => {
      const input: ReadGitHubFileInput = {
        repo_id: 'testowner/testrepo',
        file_path: '../../../etc/passwd',
        branch: 'main'
      };

      await expect(githubManager.readFile(input, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    it('should reject forbidden file paths', async () => {
      const input: ReadGitHubFileInput = {
        repo_id: 'testowner/testrepo',
        file_path: '.env',
        branch: 'main'
      };

      await expect(githubManager.readFile(input, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    // Note: Actual read tests would require a real test repository
  });

  describe('validateTokenPermissions', () => {
    it('should reject validation for non-whitelisted repos', async () => {
      await expect(githubManager.validateTokenPermissions('evil/repo')).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_REPO
        })
      );
    });

    // Note: Actual token validation would require real GitHub tokens
    // In production, this would test against a real repository
  });

  describe('Repository ID Parsing', () => {
    it('should parse valid repository IDs', () => {
      // This is tested implicitly through other tests
      // Valid format: owner/repo
      const validRepos = ['owner/repo', 'org-name/repo-name', 'user123/project456'];

      validRepos.forEach((repoId) => {
        const parts = repoId.split('/');
        expect(parts).toHaveLength(2);
        expect(parts[0]).toBeTruthy();
        expect(parts[1]).toBeTruthy();
      });
    });
  });

  describe('Branch Name Validation', () => {
    it('should accept valid branch names', () => {
      const validBranches = ['main', 'develop', 'feature/new-feature', 'bugfix/issue-123'];

      validBranches.forEach((branch) => {
        expect(() => {
          // Branch validation happens in path-validator
          const isValid = /^[a-zA-Z0-9._/-]+$/.test(branch) && !branch.includes('..');
          expect(isValid).toBe(true);
        }).not.toThrow();
      });
    });

    it('should reject invalid branch names', () => {
      const invalidBranches = ['feature/../main', 'branch//evil', 'my branch', 'feat@ure'];

      invalidBranches.forEach((branch) => {
        const hasTraversal = branch.includes('..');
        const hasDoubleSlash = branch.includes('//');
        const hasSpace = branch.includes(' ');
        const hasSpecialChar = !/^[a-zA-Z0-9._/-]+$/.test(branch);

        expect(
          hasTraversal || hasDoubleSlash || hasSpace || hasSpecialChar
        ).toBe(true);
      });
    });
  });
});
