import { z } from 'zod';

// Project name validation: 1-50 chars, alphanumeric, underscore, hyphen only
const projectNameSchema = z.string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Project name must contain only alphanumeric characters, underscores, and hyphens');

// Branch name validation: alphanumeric, dots, underscores, forward slashes, hyphens
const branchNameSchema = z.string()
  .regex(/^[a-zA-Z0-9._/-]+$/, 'Branch name contains invalid characters')
  .refine(val => !val.includes('..'), 'Branch name cannot contain ".."')
  .refine(val => !val.includes('//'), 'Branch name cannot contain "//"');

// File path validation: no absolute paths, no traversal
const filePathSchema = z.string()
  .regex(/^[a-zA-Z0-9._/-]+$/, 'File path contains invalid characters')
  .refine(val => !val.startsWith('/'), 'File path cannot be absolute')
  .refine(val => !val.includes('..'), 'File path cannot contain ".."');

// UUID validation
const uuidSchema = z.string().uuid('Invalid sandbox ID format');

// Template enum
const templateSchema = z.enum(['react', 'next', 'vue', 'node'], {
  errorMap: () => ({ message: 'Template must be one of: react, next, vue, node' })
});

// Output type enum
const outputTypeSchema = z.enum(['console_log', 'build_output', 'preview_url'], {
  errorMap: () => ({ message: 'Output type must be one of: console_log, build_output, preview_url' })
});

// Files record with path validation
const filesRecordSchema = (maxFiles: number, maxSize: number) =>
  z.record(filePathSchema, z.string().max(maxSize, `File content exceeds ${maxSize} bytes`))
    .refine(val => Object.keys(val).length <= maxFiles, `Cannot exceed ${maxFiles} files`);

// CreateSandboxInput Schema
export const CreateSandboxInputSchema = z.object({
  project_name: projectNameSchema,
  template: templateSchema,
  initial_files: filesRecordSchema(20, 1024 * 1024).optional()
});

export type CreateSandboxInput = z.infer<typeof CreateSandboxInputSchema>;

// CommitToPushInput Schema
export const CommitToPushInputSchema = z.object({
  repo_id: z.string().min(1, 'Repository ID is required'),
  branch: branchNameSchema,
  files: filesRecordSchema(10, 500 * 1024),
  commit_message: z.string().min(1).max(200, 'Commit message must be 1-200 characters'),
  create_pr: z.boolean().optional(),
  pr_title: z.string().max(100, 'PR title must be at most 100 characters').optional()
});

export type CommitToPushInput = z.infer<typeof CommitToPushInputSchema>;

// WriteFilesInput Schema
export const WriteFilesInputSchema = z.object({
  sandbox_id: uuidSchema,
  files: filesRecordSchema(10, 500 * 1024)
});

export type WriteFilesInput = z.infer<typeof WriteFilesInputSchema>;

// GetSandboxOutputInput Schema
export const GetSandboxOutputInputSchema = z.object({
  sandbox_id: uuidSchema,
  output_type: outputTypeSchema
});

export type GetSandboxOutputInput = z.infer<typeof GetSandboxOutputInputSchema>;

// ReadGitHubFileInput Schema
export const ReadGitHubFileInputSchema = z.object({
  repo_id: z.string().min(1, 'Repository ID is required'),
  file_path: filePathSchema,
  branch: z.string().default('main')
});

export type ReadGitHubFileInput = z.infer<typeof ReadGitHubFileInputSchema>;

// Sandbox metadata for listing
export interface SandboxMetadata {
  sandbox_id: string;
  project_name: string;
  created_at: string;
  preview_url: string;
  status: 'running' | 'stopped' | 'error';
}

// Configuration interface
export interface Config {
  mcp_port: number;
  csb_api_key: string;
  csb_workspace_id: string;
  rate_limit_per_minute: number;
  sandbox_idle_timeout_ms: number;
  max_sandbox_age_ms: number;
  github_token_map: Record<string, string>;
  http_enabled: boolean;
  http_port: number;
}

// Audit log interface
export interface AuditLog {
  timestamp: string;
  user_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
  result: 'success' | 'failure' | 'rate_limited';
  error?: string;
  sandbox_id?: string;
  execution_time_ms: number;
  hash: string;
}

// User tier for rate limiting
export type UserTier = 'free' | 'pro';
