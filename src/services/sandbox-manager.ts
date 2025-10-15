import { CodeSandbox } from '@codesandbox/sdk';
import { CreateSandboxInput, SandboxMetadata } from '../types/index.js';
import { assertValidFilePath } from './path-validator.js';
import { auditLogger } from './audit-logger.js';
import { MCPError, ERROR_CODES, sanitizeErrorMessage } from '../middleware/error-handler.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export class SandboxManager {
  private sdk: CodeSandbox;

  constructor(apiKey: string, _workspaceId: string) {
    this.sdk = new CodeSandbox(apiKey);
  }

  async createSandbox(
    input: CreateSandboxInput,
    userId: string
  ): Promise<{ sandbox_id: string; preview_url: string }> {
    const startTime = Date.now();

    try {
      // Validate file paths
      if (input.initial_files) {
        for (const filePath of Object.keys(input.initial_files)) {
          assertValidFilePath(filePath);
        }
      }

      // Create sandbox using SDK
      const sandbox = await this.sdk.sandboxes.create({
        template: input.template,
      });

      // Write initial files if provided
      if (input.initial_files && Object.keys(input.initial_files).length > 0) {
        const session = await sandbox.connect();
        
        for (const [path, content] of Object.entries(input.initial_files)) {
          await session.filesystem.writeFile(path, content);
        }
      }

      const executionTime = Date.now() - startTime;

      auditLogger.log(
        userId,
        'create_sandbox',
        { project_name: input.project_name, template: input.template },
        'success',
        executionTime,
        undefined,
        sandbox.id
      );

      logger.info({
        action: 'sandbox_created',
        sandbox_id: sandbox.id,
        project_name: input.project_name,
        template: input.template,
        userId
      });

      return {
        sandbox_id: sandbox.id,
        preview_url: `https://codesandbox.io/p/sandbox/${sandbox.id}`
      };
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

      throw new MCPError(
        ERROR_CODES.EXTERNAL_SERVICE_ERROR,
        `Failed to create sandbox: ${sanitizeErrorMessage(errorMessage)}`,
        500,
        true
      );
    }
  }

  async writeFiles(
    sandboxId: string,
    files: Record<string, string>,
    userId: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Validate file paths
      for (const filePath of Object.keys(files)) {
        assertValidFilePath(filePath);
      }

      // Resume sandbox and write files
      const sandbox = await this.sdk.sandboxes.resume(sandboxId);
      const session = await sandbox.connect();

      for (const [path, content] of Object.entries(files)) {
        await session.filesystem.writeFile(path, content);
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

      throw new MCPError(
        ERROR_CODES.EXTERNAL_SERVICE_ERROR,
        `Failed to write files: ${sanitizeErrorMessage(errorMessage)}`,
        500,
        true
      );
    }
  }

  async getSandboxOutput(
    sandboxId: string,
    outputType: 'console_log' | 'build_output' | 'preview_url',
    userId: string
  ): Promise<string> {
    const startTime = Date.now();

    try {
      if (outputType === 'preview_url') {
        return `https://codesandbox.io/p/sandbox/${sandboxId}`;
      }

      const sandbox = await this.sdk.sandboxes.resume(sandboxId);
      const session = await sandbox.connect();

      let output: string;

      if (outputType === 'console_log') {
        // Get recent terminal output
        const terminal = await session.terminals.create();
        output = await terminal.read();
      } else {
        // build_output - try to read build logs
        output = 'Build output not yet implemented';
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

      throw new MCPError(
        ERROR_CODES.SANDBOX_NOT_FOUND,
        `Failed to get sandbox output: ${sanitizeErrorMessage(errorMessage)}`,
        404,
        false
      );
    }
  }

  async getAllSandboxes(_userId: string): Promise<SandboxMetadata[]> {
    // SDK doesn't have a list method yet, return empty array
    return [];
  }
}
