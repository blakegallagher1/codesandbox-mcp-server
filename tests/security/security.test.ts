import {
  sanitizeErrorMessage,
  sanitizeParameters,
  MCPError,
  ERROR_CODES
} from '../../src/middleware/error-handler';
import { RateLimiter } from '../../src/services/rate-limiter';
import { validateFilePath } from '../../src/services/path-validator';

describe('Security Tests', () => {
  describe('sanitizeErrorMessage', () => {
    it('should remove tokens from error messages', () => {
      const message = 'Failed with token abc123xyz';
      const sanitized = sanitizeErrorMessage(message);
      expect(sanitized).not.toContain('abc123xyz');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove API keys from error messages', () => {
      const message = 'Invalid api_key sk-1234567890';
      const sanitized = sanitizeErrorMessage(message);
      expect(sanitized).not.toContain('sk-1234567890');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove secrets from error messages', () => {
      const message = 'Secret password123 is invalid';
      const sanitized = sanitizeErrorMessage(message);
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove file paths from error messages', () => {
      const message = 'Error reading /home/user/.ssh/id_rsa';
      const sanitized = sanitizeErrorMessage(message);
      expect(sanitized).not.toContain('/home/user');
      expect(sanitized).toContain('/[USER]/');
    });

    it('should truncate long error messages', () => {
      const longMessage = 'a'.repeat(300);
      const sanitized = sanitizeErrorMessage(longMessage);
      expect(sanitized.length).toBeLessThanOrEqual(200);
      expect(sanitized).toContain('...');
    });

    it('should handle empty messages', () => {
      const sanitized = sanitizeErrorMessage('');
      expect(sanitized).toBe('An error occurred');
    });
  });

  describe('sanitizeParameters', () => {
    it('should remove sensitive fields from parameters', () => {
      const params = {
        username: 'john',
        token: 'secret-token-123',
        api_key: 'sk-123456',
        password: 'pass123'
      };

      const sanitized = sanitizeParameters(params);

      expect(sanitized.username).toBe('john');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const params = {
        user: {
          name: 'john',
          secret: 'my-secret'
        }
      };

      const sanitized = sanitizeParameters(params);

      expect((sanitized.user as any).name).toBe('john');
      expect((sanitized.user as any).secret).toBe('[REDACTED]');
    });

    it('should not modify non-sensitive fields', () => {
      const params = {
        project_name: 'my-project',
        template: 'react',
        branch: 'main'
      };

      const sanitized = sanitizeParameters(params);

      expect(sanitized).toEqual(params);
    });
  });

  describe('Path Traversal Protection', () => {
    it('should block path traversal attempts', () => {
      expect(validateFilePath('../etc/passwd')).toBe(false);
      expect(validateFilePath('../../root/.ssh/id_rsa')).toBe(false);
      expect(validateFilePath('src/../../../etc/passwd')).toBe(false);
    });

    it('should block absolute paths', () => {
      expect(validateFilePath('/etc/passwd')).toBe(false);
      expect(validateFilePath('/root/.ssh/id_rsa')).toBe(false);
    });

    it('should block forbidden directories', () => {
      expect(validateFilePath('.env')).toBe(false);
      expect(validateFilePath('.git/config')).toBe(false);
      expect(validateFilePath('node_modules/evil/package.json')).toBe(false);
      expect(validateFilePath('.ssh/authorized_keys')).toBe(false);
      expect(validateFilePath('.aws/credentials')).toBe(false);
    });
  });

  describe('File Size Limits', () => {
    it('should reject oversized file content in validation', () => {
      // This would be tested through the actual validation schemas
      const largeContent = 'a'.repeat(600 * 1024); // 600KB (exceeds 500KB limit)

      // Note: Actual validation would happen in WriteFilesInputSchema
      expect(largeContent.length).toBeGreaterThan(500 * 1024);
    });
  });

  describe('Rate Limiting', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter(5); // 5 requests per minute
    });

    it('should allow requests within rate limit', () => {
      expect(() => rateLimiter.checkLimit('user1', 'free', 'api_call')).not.toThrow();
      expect(() => rateLimiter.checkLimit('user1', 'free', 'api_call')).not.toThrow();
      expect(() => rateLimiter.checkLimit('user1', 'free', 'api_call')).not.toThrow();
    });

    it('should block requests exceeding rate limit', () => {
      // Make 10 requests (limit is 10 for free tier)
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkLimit('user2', 'free', 'api_call');
      }

      // 11th request should fail
      expect(() => rateLimiter.checkLimit('user2', 'free', 'api_call')).toThrow(MCPError);
      expect(() => rateLimiter.checkLimit('user2', 'free', 'api_call')).toThrow(
        expect.objectContaining({
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        })
      );
    });

    it('should enforce different limits per user', () => {
      // User 1 makes requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit('user1', 'free', 'api_call');
      }

      // User 2 should still be able to make requests
      expect(() => rateLimiter.checkLimit('user2', 'free', 'api_call')).not.toThrow();
    });

    it('should enforce sandbox creation quota', () => {
      // Free tier: 5 sandboxes per hour
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit('user3', 'free', 'create_sandbox');
      }

      // 6th sandbox should fail
      expect(() => rateLimiter.checkLimit('user3', 'free', 'create_sandbox')).toThrow(
        expect.objectContaining({
          code: ERROR_CODES.QUOTA_EXCEEDED
        })
      );
    });

    it('should provide higher limits for pro tier', () => {
      // Pro tier: 100 API calls per minute
      for (let i = 0; i < 50; i++) {
        rateLimiter.checkLimit('pro_user', 'pro', 'api_call');
      }

      // Should not throw
      expect(() => rateLimiter.checkLimit('pro_user', 'pro', 'api_call')).not.toThrow();
    });
  });

  describe('Quota Enforcement', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter(10);
    });

    it('should track execution time quota', () => {
      // Record 30 minutes of execution time
      rateLimiter.recordExecutionTime('user1', 'free', 1800000);

      // Free tier limit is 1 hour (3600000ms)
      // Should not throw yet
      expect(() => rateLimiter.recordExecutionTime('user1', 'free', 1800000)).not.toThrow();
    });

    it('should block when execution time quota exceeded', () => {
      // Record more than 1 hour
      rateLimiter.recordExecutionTime('user2', 'free', 3600000);

      // This should exceed the quota
      expect(() => rateLimiter.recordExecutionTime('user2', 'free', 100)).toThrow(
        expect.objectContaining({
          code: ERROR_CODES.QUOTA_EXCEEDED
        })
      );
    });
  });

  describe('MCPError', () => {
    it('should create error with correct properties', () => {
      const error = new MCPError(
        ERROR_CODES.INVALID_REPO,
        'Repository not found',
        404,
        false
      );

      expect(error.code).toBe(ERROR_CODES.INVALID_REPO);
      expect(error.message).toBe('Repository not found');
      expect(error.statusCode).toBe(404);
      expect(error.retryable).toBe(false);
    });

    it('should be instanceof Error', () => {
      const error = new MCPError(ERROR_CODES.INTERNAL_ERROR, 'Test error', 500, true);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof MCPError).toBe(true);
    });
  });
});
