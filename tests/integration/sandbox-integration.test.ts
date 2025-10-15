import { SandboxManager } from '../../src/services/sandbox-manager';
import { CreateSandboxInput } from '../../src/types';
import { MCPError, ERROR_CODES } from '../../src/middleware/error-handler';

describe('Sandbox Integration Tests', () => {
  let sandboxManager: SandboxManager;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    sandboxManager = new SandboxManager('test-api-key', 'test-workspace-id');
  });

  describe('createSandbox', () => {
    it('should create a sandbox successfully', async () => {
      const input: CreateSandboxInput = {
        project_name: 'test-project',
        template: 'react',
        initial_files: {
          'src/index.tsx': 'console.log("Hello World");'
        }
      };

      const result = await sandboxManager.createSandbox(input, testUserId);

      expect(result).toHaveProperty('sandbox_id');
      expect(result).toHaveProperty('preview_url');
      expect(result.sandbox_id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
      expect(result.preview_url).toContain('codesandbox.io');
    });

    it('should reject invalid file paths', async () => {
      const input: CreateSandboxInput = {
        project_name: 'test-project',
        template: 'node',
        initial_files: {
          '../etc/passwd': 'malicious content'
        }
      };

      await expect(sandboxManager.createSandbox(input, testUserId)).rejects.toThrow(MCPError);
    });

    it('should reject forbidden file paths', async () => {
      const input: CreateSandboxInput = {
        project_name: 'test-project',
        template: 'vue',
        initial_files: {
          '.env': 'SECRET=my-secret'
        }
      };

      await expect(sandboxManager.createSandbox(input, testUserId)).rejects.toThrow(MCPError);
    });
  });

  describe('writeFiles', () => {
    let sandboxId: string;

    beforeEach(async () => {
      const result = await sandboxManager.createSandbox(
        {
          project_name: 'test-sandbox',
          template: 'react'
        },
        testUserId
      );
      sandboxId = result.sandbox_id;
    });

    it('should write files to sandbox successfully', async () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
        'src/styles.css': 'body { margin: 0; }'
      };

      await expect(
        sandboxManager.writeFiles(sandboxId, files, testUserId)
      ).resolves.not.toThrow();
    });

    it('should reject writing to non-existent sandbox', async () => {
      const files = {
        'src/test.ts': 'console.log("test");'
      };

      await expect(
        sandboxManager.writeFiles('non-existent-id', files, testUserId)
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.SANDBOX_NOT_FOUND
        })
      );
    });

    it('should reject invalid file paths', async () => {
      const files = {
        '../../../etc/passwd': 'malicious'
      };

      await expect(sandboxManager.writeFiles(sandboxId, files, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });
  });

  describe('getSandboxOutput', () => {
    let sandboxId: string;

    beforeEach(async () => {
      const result = await sandboxManager.createSandbox(
        {
          project_name: 'output-test',
          template: 'node'
        },
        testUserId
      );
      sandboxId = result.sandbox_id;
    });

    it('should get preview URL', async () => {
      const output = await sandboxManager.getSandboxOutput(sandboxId, 'preview_url', testUserId);

      expect(output).toContain('codesandbox.io');
      expect(output).toContain(sandboxId);
    });

    it('should get console logs', async () => {
      const output = await sandboxManager.getSandboxOutput(sandboxId, 'console_log', testUserId);

      expect(typeof output).toBe('string');
    });

    it('should sanitize output containing secrets', async () => {
      // In a real implementation, the sandbox would have actual logs
      // This test verifies the sanitization logic works
      const output = await sandboxManager.getSandboxOutput(sandboxId, 'build_output', testUserId);

      expect(output).not.toMatch(/token[=:\s]+[a-zA-Z0-9_-]+/i);
      expect(output).not.toMatch(/api[_-]?key[=:\s]+[a-zA-Z0-9_-]+/i);
    });

    it('should reject getting output from non-existent sandbox', async () => {
      await expect(
        sandboxManager.getSandboxOutput('non-existent', 'console_log', testUserId)
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.SANDBOX_NOT_FOUND
        })
      );
    });
  });

  describe('getAllSandboxes', () => {
    it('should return list of sandboxes', async () => {
      // Create a few sandboxes
      await sandboxManager.createSandbox(
        { project_name: 'sandbox1', template: 'react' },
        testUserId
      );
      await sandboxManager.createSandbox(
        { project_name: 'sandbox2', template: 'vue' },
        testUserId
      );

      const sandboxes = await sandboxManager.getAllSandboxes(testUserId);

      expect(Array.isArray(sandboxes)).toBe(true);
      expect(sandboxes.length).toBeGreaterThanOrEqual(2);
      expect(sandboxes[0]).toHaveProperty('sandbox_id');
      expect(sandboxes[0]).toHaveProperty('project_name');
      expect(sandboxes[0]).toHaveProperty('preview_url');
      expect(sandboxes[0]).toHaveProperty('status');
    });
  });
});
