import {
  CreateSandboxInputSchema,
  WriteFilesInputSchema,
  GetSandboxOutputInputSchema
} from '../types/index.js';
import { validateInput } from '../middleware/validation.js';
import { SandboxManager } from '../services/sandbox-manager.js';
import { RateLimiter } from '../services/rate-limiter.js';
import { config } from '../services/config.js';
import { auditLogger } from '../services/audit-logger.js';
import { MCPError, ERROR_CODES } from '../middleware/error-handler.js';

// Initialize services
const sandboxManager = new SandboxManager(
  config.get('csb_api_key'),
  config.get('csb_workspace_id')
);

const rateLimiter = new RateLimiter(config.get('rate_limit_per_minute'));

/**
 * Tool 1: Create sandbox for project
 */
export async function create_sandbox_for_project(
  params: unknown,
  userId: string = 'default_user'
): Promise<{ sandbox_id: string; preview_url: string }> {
  const startTime = Date.now();

  try {
    // Validate input
    const input = validateInput(CreateSandboxInputSchema, params);

    // Check rate limits
    rateLimiter.checkLimit(userId, 'free', 'api_call');
    rateLimiter.checkLimit(userId, 'free', 'create_sandbox');

    // Create sandbox
    const result = await sandboxManager.createSandbox(input, userId);

    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;

    if (error instanceof MCPError && error.code === ERROR_CODES.RATE_LIMIT_EXCEEDED) {
      auditLogger.log(
        userId,
        'create_sandbox_for_project',
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
 * Tool 2: Write files to sandbox
 */
export async function write_files_to_sandbox(
  params: unknown,
  userId: string = 'default_user'
): Promise<{ success: boolean; files_written: number }> {
  const startTime = Date.now();

  try {
    // Validate input
    const input = validateInput(WriteFilesInputSchema, params);

    // Check rate limits
    rateLimiter.checkLimit(userId, 'free', 'api_call');

    // Write files
    await sandboxManager.writeFiles(input.sandbox_id, input.files, userId);

    return {
      success: true,
      files_written: Object.keys(input.files).length
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;

    if (error instanceof MCPError && error.code === ERROR_CODES.RATE_LIMIT_EXCEEDED) {
      auditLogger.log(
        userId,
        'write_files_to_sandbox',
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
 * Tool 3: Get sandbox output
 */
export async function get_sandbox_output(
  params: unknown,
  userId: string = 'default_user'
): Promise<{ output: string; output_type: string }> {
  const startTime = Date.now();

  try {
    // Validate input
    const input = validateInput(GetSandboxOutputInputSchema, params);

    // Check rate limits (read-only, but still rate-limited)
    rateLimiter.checkLimit(userId, 'free', 'api_call');

    // Get output
    const output = await sandboxManager.getSandboxOutput(
      input.sandbox_id,
      input.output_type,
      userId
    );

    return {
      output,
      output_type: input.output_type
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;

    if (error instanceof MCPError && error.code === ERROR_CODES.RATE_LIMIT_EXCEEDED) {
      auditLogger.log(
        userId,
        'get_sandbox_output',
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
export const sandboxTools = [
  {
    name: 'create_sandbox_for_project',
    description: 'Create a new CodeSandbox with specified template and initial files',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'Project name (1-50 chars, alphanumeric, underscore, hyphen only)',
          minLength: 1,
          maxLength: 50,
          pattern: '^[a-zA-Z0-9_-]+$'
        },
        template: {
          type: 'string',
          enum: ['react', 'next', 'vue', 'node'],
          description: 'Sandbox template type'
        },
        initial_files: {
          type: 'object',
          description: 'Initial files to create (max 20 files, 1MB each)',
          additionalProperties: { type: 'string' }
        }
      },
      required: ['project_name', 'template']
    },
    handler: create_sandbox_for_project
  },
  {
    name: 'write_files_to_sandbox',
    description: 'Write or update files in an existing sandbox',
    inputSchema: {
      type: 'object',
      properties: {
        sandbox_id: {
          type: 'string',
          description: 'UUID of the sandbox',
          format: 'uuid'
        },
        files: {
          type: 'object',
          description: 'Files to write (max 10 files, 500KB each)',
          additionalProperties: { type: 'string' }
        }
      },
      required: ['sandbox_id', 'files']
    },
    handler: write_files_to_sandbox
  },
  {
    name: 'get_sandbox_output',
    description: 'Retrieve console logs, build output, or preview URL from a sandbox',
    inputSchema: {
      type: 'object',
      properties: {
        sandbox_id: {
          type: 'string',
          description: 'UUID of the sandbox',
          format: 'uuid'
        },
        output_type: {
          type: 'string',
          enum: ['console_log', 'build_output', 'preview_url'],
          description: 'Type of output to retrieve'
        }
      },
      required: ['sandbox_id', 'output_type']
    },
    handler: get_sandbox_output
  }
];
