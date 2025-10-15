import { CreateSandboxInput, SandboxMetadata } from '../types/index.js';
import { assertValidFilePath } from './path-validator.js';
import { auditLogger } from './audit-logger.js';
import { MCPError, ERROR_CODES, sanitizeErrorMessage } from '../middleware/error-handler.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Mock sandbox storage (in production, this would use CodeSandbox SDK)
interface SandboxData {
  sandbox_id: string;
  project_name: string;
  template: string;
  created_at: string;
  preview_url: string;
  status: 'running' | 'stopped' | 'error';
  files: Record<string, string>;
  console_logs: string[];
  build_output: string[];
}

export class SandboxManager {
  private sandboxes: Map<string, SandboxData> = new Map();

  constructor(_apiKey: string, _workspaceId: string) {
    // API key and workspace ID would be used in production with CodeSandbox SDK
  }

  /**
   * Create a new sandbox with resource limits
   */
  async createSandbox(
    input: CreateSandboxInput,
    userId: string
  ): Promise<{ sandbox_id: string; preview_url: string }> {
    const startTime = Date.now();

    try {
      // Validate initial files if provided
      if (input.initial_files) {
        for (const filePath of Object.keys(input.initial_files)) {
          assertValidFilePath(filePath);
        }
      }

      // Generate sandbox ID (UUID v4)
      const sandbox_id = this.generateUUID();
      const preview_url = `https://codesandbox.io/p/sandbox/${sandbox_id}`;

      // Create sandbox data
      const sandboxData: SandboxData = {
        sandbox_id,
        project_name: input.project_name,
        template: input.template,
        created_at: new Date().toISOString(),
        preview_url,
        status: 'running',
        files: input.initial_files || {},
        console_logs: [],
        build_output: []
      };

      this.sandboxes.set(sandbox_id, sandboxData);

      const executionTime = Date.now() - startTime;

      // Log to audit
      auditLogger.log(
        userId,
        'create_sandbox',
        { project_name: input.project_name, template: input.template },
        'success',
        executionTime,
        undefined,
        sandbox_id
      );

      logger.info({
        action: 'sandbox_created',
        sandbox_id,
        project_name: input.project_name,
        template: input.template,
        userId
      });

      // Note: In production, this would call CodeSandbox SDK:
      // const sandbox = await createSandbox({
      //   template: input.template,
      //   files: input.initial_files,
      //   resources: { memory: '512MB', cpu: '50%', timeout: 120000 },
      //   ttl: 3600000 // 1 hour
      // });

      return { sandbox_id, preview_url };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      auditLogger.log(
        userId,
        'create_sandbox',
        { project_name: input.project_name, template: input.template },
        'failure',
        executionTime,
        sanitizeErrorMessage(errorMessage)
      );

      throw error;
    }
  }

  /**
   * Write files to an existing sandbox
   */
  async writeFiles(
    sandboxId: string,
    files: Record<string, string>,
    userId: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Validate sandbox exists
      const sandbox = this.sandboxes.get(sandboxId);
      if (!sandbox) {
        throw new MCPError(
          ERROR_CODES.SANDBOX_NOT_FOUND,
          `Sandbox ${sandboxId} not found`,
          404,
          false
        );
      }

      // Validate all file paths
      for (const filePath of Object.keys(files)) {
        assertValidFilePath(filePath);
      }

      // Calculate total size
      const totalSize = Object.values(files).reduce((sum, content) => sum + content.length, 0);
      const maxSize = 10 * 500 * 1024; // 10 files * 500KB

      if (totalSize > maxSize) {
        throw new MCPError(
          ERROR_CODES.FILE_SIZE_EXCEEDED,
          'Total file size exceeds quota',
          400,
          false
        );
      }

      // Write files to sandbox
      for (const [path, content] of Object.entries(files)) {
        sandbox.files[path] = content;
      }

      const executionTime = Date.now() - startTime;

      auditLogger.log(
        userId,
        'write_files',
        { sandbox_id: sandboxId, file_count: Object.keys(files).length },
        'success',
        executionTime,
        undefined,
        sandboxId
      );

      logger.info({
        action: 'files_written',
        sandbox_id: sandboxId,
        file_count: Object.keys(files).length,
        userId
      });

      // Note: In production, this would call CodeSandbox SDK:
      // await sandbox.writeFiles(files);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      auditLogger.log(
        userId,
        'write_files',
        { sandbox_id: sandboxId },
        'failure',
        executionTime,
        sanitizeErrorMessage(errorMessage),
        sandboxId
      );

      throw error;
    }
  }

  /**
   * Get sandbox output (console logs, build output, or preview URL)
   */
  async getSandboxOutput(
    sandboxId: string,
    outputType: 'console_log' | 'build_output' | 'preview_url',
    userId: string
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // Validate sandbox exists
      const sandbox = this.sandboxes.get(sandboxId);
      if (!sandbox) {
        throw new MCPError(
          ERROR_CODES.SANDBOX_NOT_FOUND,
          `Sandbox ${sandboxId} not found`,
          404,
          false
        );
      }

      let output: string;

      switch (outputType) {
        case 'console_log':
          output = this.sanitizeOutput(sandbox.console_logs.join('\n'));
          break;
        case 'build_output':
          output = this.sanitizeOutput(sandbox.build_output.join('\n'));
          break;
        case 'preview_url':
          output = sandbox.preview_url;
          break;
      }

      const executionTime = Date.now() - startTime;

      auditLogger.log(
        userId,
        'get_sandbox_output',
        { sandbox_id: sandboxId, output_type: outputType },
        'success',
        executionTime,
        undefined,
        sandboxId
      );

      return output;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      auditLogger.log(
        userId,
        'get_sandbox_output',
        { sandbox_id: sandboxId, output_type: outputType },
        'failure',
        executionTime,
        sanitizeErrorMessage(errorMessage),
        sandboxId
      );

      throw error;
    }
  }

  /**
   * Get all sandboxes for a user
   */
  async getAllSandboxes(_userId: string): Promise<SandboxMetadata[]> {
    // In production, this would filter by userId
    const sandboxes: SandboxMetadata[] = [];

    for (const sandbox of this.sandboxes.values()) {
      sandboxes.push({
        sandbox_id: sandbox.sandbox_id,
        project_name: sandbox.project_name,
        created_at: sandbox.created_at,
        preview_url: sandbox.preview_url,
        status: sandbox.status
      });
    }

    return sandboxes;
  }

  /**
   * Sanitize output to remove sensitive information
   */
  private sanitizeOutput(output: string): string {
    let sanitized = output;

    // Remove tokens and secrets
    sanitized = sanitized.replace(/token[=:\s]+[a-zA-Z0-9_-]+/gi, 'token=[REDACTED]');
    sanitized = sanitized.replace(/api[_-]?key[=:\s]+[a-zA-Z0-9_-]+/gi, 'api_key=[REDACTED]');
    sanitized = sanitized.replace(/secret[=:\s]+[a-zA-Z0-9_-]+/gi, 'secret=[REDACTED]');
    sanitized = sanitized.replace(/password[=:\s]+[a-zA-Z0-9_-]+/gi, 'password=[REDACTED]');

    // Truncate to 50KB max
    const maxSize = 50 * 1024;
    if (sanitized.length > maxSize) {
      sanitized = sanitized.substring(0, maxSize) + '\n\n[Output truncated to 50KB]';
    }

    return sanitized;
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
