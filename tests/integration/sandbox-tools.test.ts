import {
  create_sandbox_for_project,
  write_files_to_sandbox,
  get_sandbox_output
} from '../../src/tools/sandbox-tools';
import { ERROR_CODES } from '../../src/middleware/error-handler';

describe('Sandbox Tools Integration Tests', () => {
  const testUserId = 'test-user-123';

  describe('create_sandbox_for_project', () => {
    it('should create sandbox with valid input', async () => {
      const params = {
        project_name: 'test-project',
        template: 'react',
        initial_files: {
          'src/index.tsx': 'console.log("Hello");'
        }
      };

      const result = await create_sandbox_for_project(params, testUserId);

      expect(result).toHaveProperty('sandbox_id');
      expect(result).toHaveProperty('preview_url');
      expect(result.sandbox_id).toMatch(/^[a-f0-9-]{36}$/);
    });

    it('should reject invalid project name', async () => {
      const params = {
        project_name: 'invalid name!@#',
        template: 'react'
      };

      await expect(create_sandbox_for_project(params, testUserId)).rejects.toThrow();
    });

    it('should reject invalid template', async () => {
      const params = {
        project_name: 'test',
        template: 'invalid-template'
      };

      await expect(create_sandbox_for_project(params, testUserId)).rejects.toThrow();
    });

    it('should create sandbox without initial files', async () => {
      const params = {
        project_name: 'minimal-project',
        template: 'node'
      };

      const result = await create_sandbox_for_project(params, testUserId);

      expect(result).toHaveProperty('sandbox_id');
      expect(result).toHaveProperty('preview_url');
    });

    it('should reject project name that is too long', async () => {
      const params = {
        project_name: 'a'.repeat(100),
        template: 'react'
      };

      await expect(create_sandbox_for_project(params, testUserId)).rejects.toThrow();
    });
  });

  describe('write_files_to_sandbox', () => {
    let sandboxId: string;

    beforeEach(async () => {
      const result = await create_sandbox_for_project(
        {
          project_name: 'test-sandbox',
          template: 'react'
        },
        testUserId
      );
      sandboxId = result.sandbox_id;
    });

    it('should write files successfully', async () => {
      const params = {
        sandbox_id: sandboxId,
        files: {
          'src/App.tsx': 'export default function App() {}',
          'src/index.tsx': 'import React from "react";'
        }
      };

      const result = await write_files_to_sandbox(params, testUserId);

      expect(result).toEqual({
        success: true,
        files_written: 2
      });
    });

    it('should reject invalid sandbox ID', async () => {
      const params = {
        sandbox_id: 'not-a-uuid',
        files: {
          'test.txt': 'content'
        }
      };

      await expect(write_files_to_sandbox(params, testUserId)).rejects.toThrow();
    });

    it('should reject non-existent sandbox', async () => {
      const params = {
        sandbox_id: '00000000-0000-0000-0000-000000000000',
        files: {
          'test.txt': 'content'
        }
      };

      await expect(write_files_to_sandbox(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.SANDBOX_NOT_FOUND
        })
      );
    });

    it('should reject path traversal attempts', async () => {
      const params = {
        sandbox_id: sandboxId,
        files: {
          '../../../etc/passwd': 'malicious'
        }
      };

      await expect(write_files_to_sandbox(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });

    it('should reject forbidden file paths', async () => {
      const params = {
        sandbox_id: sandboxId,
        files: {
          '.env': 'SECRET=value'
        }
      };

      await expect(write_files_to_sandbox(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.PATH_TRAVERSAL
        })
      );
    });
  });

  describe('get_sandbox_output', () => {
    let sandboxId: string;

    beforeEach(async () => {
      const result = await create_sandbox_for_project(
        {
          project_name: 'output-test',
          template: 'node'
        },
        testUserId
      );
      sandboxId = result.sandbox_id;
    });

    it('should get preview URL', async () => {
      const params = {
        sandbox_id: sandboxId,
        output_type: 'preview_url' as const
      };

      const result = await get_sandbox_output(params, testUserId);

      expect(result.output).toContain('codesandbox.io');
      expect(result.output_type).toBe('preview_url');
    });

    it('should get console logs', async () => {
      const params = {
        sandbox_id: sandboxId,
        output_type: 'console_log' as const
      };

      const result = await get_sandbox_output(params, testUserId);

      expect(typeof result.output).toBe('string');
      expect(result.output_type).toBe('console_log');
    });

    it('should get build output', async () => {
      const params = {
        sandbox_id: sandboxId,
        output_type: 'build_output' as const
      };

      const result = await get_sandbox_output(params, testUserId);

      expect(typeof result.output).toBe('string');
      expect(result.output_type).toBe('build_output');
    });

    it('should reject invalid output type', async () => {
      const params = {
        sandbox_id: sandboxId,
        output_type: 'invalid_type'
      };

      await expect(get_sandbox_output(params, testUserId)).rejects.toThrow();
    });

    it('should reject non-existent sandbox', async () => {
      const params = {
        sandbox_id: '00000000-0000-0000-0000-000000000000',
        output_type: 'console_log' as const
      };

      await expect(get_sandbox_output(params, testUserId)).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.SANDBOX_NOT_FOUND
        })
      );
    });
  });
});
