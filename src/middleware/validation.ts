import { z, ZodSchema } from 'zod';
import { MCPError, ERROR_CODES } from './error-handler.js';

/**
 * Validate input against a Zod schema
 * @param schema - Zod schema to validate against
 * @param input - Input to validate
 * @returns Validated and parsed input
 * @throws MCPError if validation fails
 */
export function validateInput<T>(schema: ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; ');
      throw new MCPError(
        ERROR_CODES.VALIDATION_ERROR,
        `Validation failed: ${errorMessages}`,
        400,
        false
      );
    }
    throw new MCPError(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid input format',
      400,
      false
    );
  }
}
