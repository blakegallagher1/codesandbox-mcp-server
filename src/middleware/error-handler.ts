import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export enum ERROR_CODES {
  INVALID_REPO = 'INVALID_REPO',
  SANDBOX_NOT_FOUND = 'SANDBOX_NOT_FOUND',
  GITHUB_AUTH_FAILED = 'GITHUB_AUTH_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_BRANCH = 'INVALID_BRANCH',
  PATH_TRAVERSAL = 'PATH_TRAVERSAL',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  SANDBOX_TIMEOUT = 'SANDBOX_TIMEOUT',
  FILE_SIZE_EXCEEDED = 'FILE_SIZE_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

export class MCPError extends Error {
  constructor(
    public code: ERROR_CODES,
    message: string,
    public statusCode: number = 500,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'MCPError';
    Object.setPrototypeOf(this, MCPError.prototype);
  }
}

/**
 * Sanitize error messages to prevent leaking sensitive information
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'An error occurred';

  let sanitized = message;

  // Truncate first before sanitization to preserve the truncation marker
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }

  // Replace tokens and secrets with pattern: word + value
  sanitized = sanitized.replace(/(token|secret|api[_-]?key|password)[\s:=]+[\S]+/gi, '$1 [REDACTED]');

  // Replace standalone sensitive words
  sanitized = sanitized.replace(/\b(token|secret|api[_-]?key|password)\b/gi, '[REDACTED]');

  // Replace file paths
  sanitized = sanitized.replace(/\/home\/\S+/g, '/[USER]/');
  sanitized = sanitized.replace(/\/Users\/\S+/g, '/[USER]/');
  sanitized = sanitized.replace(/C:\\Users\\\S+/g, 'C:\\[USER]\\');

  // Replace potential tokens (long alphanumeric strings)
  sanitized = sanitized.replace(/\b[a-zA-Z0-9_-]{40,}\b/g, '[REDACTED]');

  return sanitized;
}

/**
 * Sanitize parameters for logging (remove sensitive fields)
 */
export function sanitizeParameters(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['token', 'secret', 'api_key', 'apiKey', 'password', 'auth'];

  for (const [key, value] of Object.entries(params)) {
    const lowerKey = key.toLowerCase();

    // Check if key contains sensitive words
    const isSensitive = sensitiveKeys.some(sensitiveKey =>
      lowerKey.includes(sensitiveKey.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeParameters(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Execute a function with comprehensive error handling
 */
export async function executeWithErrorHandling<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // If it's already an MCPError, re-throw it unchanged
    if (error instanceof MCPError) {
      logger.error({
        context,
        code: error.code,
        message: sanitizeErrorMessage(error.message),
        retryable: error.retryable
      });
      throw error;
    }

    // Convert unknown errors to generic internal error
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    const sanitizedMessage = sanitizeErrorMessage(message);

    logger.error({
      context,
      error: sanitizedMessage,
      originalError: error instanceof Error ? error.name : typeof error
    });

    throw new MCPError(
      ERROR_CODES.INTERNAL_ERROR,
      'An internal error occurred. Please try again later.',
      500,
      true
    );
  }
}

/**
 * Wrap a tool execution with error handling
 */
export function wrapToolExecution<TInput, TOutput>(
  toolName: string,
  handler: (input: TInput, userId: string) => Promise<TOutput>
) {
  return async (input: TInput, userId: string): Promise<TOutput> => {
    const startTime = Date.now();

    try {
      logger.info({
        tool: toolName,
        userId,
        timestamp: new Date().toISOString()
      });

      const result = await executeWithErrorHandling(
        () => handler(input, userId),
        `${toolName} execution`
      );

      const executionTime = Date.now() - startTime;
      logger.info({
        tool: toolName,
        userId,
        executionTime,
        result: 'success'
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error({
        tool: toolName,
        userId,
        executionTime,
        result: 'failure',
        error: error instanceof MCPError ? error.code : 'UNKNOWN'
      });

      throw error;
    }
  };
}
