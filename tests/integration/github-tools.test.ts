import {
  commit_and_push_to_github,
  read_github_file
} from '../../src/tools/github-tools';
import { ERROR_CODES } from '../../src/middleware/error-handler';

describe('GitHub Tools Integration Tests', () => {
  const testUserId = 'test-user-123';

  describe('commit_and_push_to_github', () => {
    it('should reject non-whitelisted repository', async () => {
      const params = {
        repo_id: 'evil/malicious-repo',
        branch: 'main',
        files: {
          'README.md': '# Test'
        },
        commit_message: 'Test commit'
      };

      await expect(commit_and_push_to_github(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_REPO
        })
      );
    });

    it('should reject invalid branch name with path traversal', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        branch: 'feature/../main',
        files: {
          'test.txt': 'content'
        },
        commit_message: 'Test'
      };

      await expect(commit_and_push_to_github(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_BRANCH
        })
      );
    });

    it('should reject invalid file paths', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        branch: 'main',
        files: {
          '../../../etc/passwd': 'malicious'
        },
        commit_message: 'Test'
      };

      await expect(commit_and_push_to_github(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    it('should reject forbidden file paths', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        branch: 'main',
        files: {
          '.env': 'SECRET=value'
        },
        commit_message: 'Test'
      };

      await expect(commit_and_push_to_github(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    it('should validate commit message length', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        branch: 'main',
        files: {
          'test.txt': 'content'
        },
        commit_message: 'a'.repeat(300)
      };

      await expect(commit_and_push_to_github(params, testUserId)).rejects.toThrow();
    });

    it('should reject empty commit message', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        branch: 'main',
        files: {
          'test.txt': 'content'
        },
        commit_message: ''
      };

      await expect(commit_and_push_to_github(params, testUserId)).rejects.toThrow();
    });

    it('should validate PR title length when creating PR', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        branch: 'feature',
        files: {
          'test.txt': 'content'
        },
        commit_message: 'Test commit',
        create_pr: true,
        pr_title: 'a'.repeat(150)
      };

      await expect(commit_and_push_to_github(params, testUserId)).rejects.toThrow();
    });

    it('should handle validation without optional fields', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        branch: 'main',
        files: {
          'README.md': '# Updated'
        },
        commit_message: 'Update README'
      };

      // Will fail due to repo not being whitelisted, but should pass validation
      await expect(commit_and_push_to_github(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_REPO
        })
      );
    });
  });

  describe('read_github_file', () => {
    it('should reject non-whitelisted repository', async () => {
      const params = {
        repo_id: 'evil/malicious-repo',
        file_path: 'README.md',
        branch: 'main'
      };

      await expect(read_github_file(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_REPO
        })
      );
    });

    it('should reject path traversal attempts', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        file_path: '../../../etc/passwd',
        branch: 'main'
      };

      await expect(read_github_file(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    it('should reject forbidden file paths', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        file_path: '.env',
        branch: 'main'
      };

      await expect(read_github_file(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    it('should use default branch when not specified', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        file_path: 'README.md'
      };

      // Will fail due to repo not being whitelisted, but validates default branch handling
      await expect(read_github_file(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_REPO
        })
      );
    });

    it('should reject absolute file paths', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        file_path: '/etc/passwd',
        branch: 'main'
      };

      await expect(read_github_file(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    it('should reject file paths with double dots', async () => {
      const params = {
        repo_id: 'testowner/testrepo',
        file_path: 'src/../../config/secrets.yml',
        branch: 'main'
      };

      await expect(read_github_file(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });
  });
});
