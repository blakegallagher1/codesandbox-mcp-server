import {
  validateFilePath,
  validateBranchName,
  validateRepoId,
  assertValidFilePath,
  assertValidBranchName,
  assertValidRepoId
} from '../../src/services/path-validator';
import { MCPError } from '../../src/middleware/error-handler';

describe('Path Validator', () => {
  describe('validateFilePath', () => {
    it('should accept valid file paths', () => {
      expect(validateFilePath('src/index.ts')).toBe(true);
      expect(validateFilePath('components/Button.tsx')).toBe(true);
      expect(validateFilePath('utils/helpers.js')).toBe(true);
      expect(validateFilePath('README.md')).toBe(true);
    });

    it('should reject paths with ".."', () => {
      expect(validateFilePath('../etc/passwd')).toBe(false);
      expect(validateFilePath('src/../../../etc/passwd')).toBe(false);
      expect(validateFilePath('dir/../file.txt')).toBe(false);
    });

    it('should reject absolute paths', () => {
      expect(validateFilePath('/etc/passwd')).toBe(false);
      expect(validateFilePath('/home/user/file.txt')).toBe(false);
      expect(validateFilePath('/root/.ssh/id_rsa')).toBe(false);
    });

    it('should reject Windows absolute paths', () => {
      expect(validateFilePath('C:/Windows/System32')).toBe(false);
      expect(validateFilePath('D:/Users/file.txt')).toBe(false);
    });

    it('should reject forbidden paths', () => {
      expect(validateFilePath('.env')).toBe(false);
      expect(validateFilePath('.env.local')).toBe(false);
      expect(validateFilePath('.git/config')).toBe(false);
      expect(validateFilePath('node_modules/package/index.js')).toBe(false);
      expect(validateFilePath('.ssh/id_rsa')).toBe(false);
      expect(validateFilePath('.aws/credentials')).toBe(false);
    });

    it('should throw error when asserting invalid paths', () => {
      expect(() => assertValidFilePath('../etc/passwd')).toThrow(MCPError);
      expect(() => assertValidFilePath('/etc/passwd')).toThrow(MCPError);
      expect(() => assertValidFilePath('.env')).toThrow(MCPError);
    });
  });

  describe('validateBranchName', () => {
    it('should accept valid branch names', () => {
      expect(validateBranchName('main')).toBe(true);
      expect(validateBranchName('feature/new-feature')).toBe(true);
      expect(validateBranchName('bugfix/fix-123')).toBe(true);
      expect(validateBranchName('release/v1.0.0')).toBe(true);
      expect(validateBranchName('dev_branch')).toBe(true);
    });

    it('should reject branch names with spaces', () => {
      expect(validateBranchName('my branch')).toBe(false);
      expect(validateBranchName('feature branch')).toBe(false);
    });

    it('should reject branch names with ".."', () => {
      expect(validateBranchName('feature/../main')).toBe(false);
      expect(validateBranchName('../evil')).toBe(false);
    });

    it('should reject branch names with "//"', () => {
      expect(validateBranchName('feature//branch')).toBe(false);
      expect(validateBranchName('//evil')).toBe(false);
    });

    it('should reject branch names with special characters', () => {
      expect(validateBranchName('feature@branch')).toBe(false);
      expect(validateBranchName('feature#branch')).toBe(false);
      expect(validateBranchName('feature$branch')).toBe(false);
    });

    it('should throw error when asserting invalid branch names', () => {
      expect(() => assertValidBranchName('my branch')).toThrow(MCPError);
      expect(() => assertValidBranchName('feature/../main')).toThrow(MCPError);
    });
  });

  describe('validateRepoId', () => {
    const allowedRepos = {
      'owner1/repo1': 'token1',
      'owner2/repo2': 'token2'
    };

    it('should accept valid repo IDs in allowlist', () => {
      expect(validateRepoId('owner1/repo1', allowedRepos)).toBe(true);
      expect(validateRepoId('owner2/repo2', allowedRepos)).toBe(true);
    });

    it('should reject repo IDs not in allowlist', () => {
      expect(validateRepoId('owner3/repo3', allowedRepos)).toBe(false);
      expect(validateRepoId('evil/repo', allowedRepos)).toBe(false);
    });

    it('should throw error when asserting invalid repo IDs', () => {
      expect(() => assertValidRepoId('owner3/repo3', allowedRepos)).toThrow(MCPError);
      expect(() => assertValidRepoId('evil/repo', allowedRepos)).toThrow(MCPError);
    });
  });
});
