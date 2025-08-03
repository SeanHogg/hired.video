/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Base API Response Schema
 */
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

/**
 * Error Response Schema
 */
export const ApiErrorResponseSchema = ApiResponseSchema.extend({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

/**
 * Success Response Schema
 */
export const ApiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  ApiResponseSchema.extend({
    success: z.literal(true),
    data: dataSchema,
  });

/**
 * Demo Response Schema
 */
export const DemoResponseSchema = z.object({
  message: z.string(),
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Base API Response Type
 */
export type ApiResponse = z.infer<typeof ApiResponseSchema>;

/**
 * Error Response Type
 */
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Success Response Type
 */
export type ApiSuccessResponse<T> = {
  success: true;
  message?: string;
  timestamp?: string;
  data: T;
};

/**
 * Demo Response Type
 */
export type DemoResponse = z.infer<typeof DemoResponseSchema>;

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validates API response data against a schema
 */
export function validateApiResponse<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation failed: ${error.errors.map(e => e.message).join(', ')}`,
      };
    }
    return {
      success: false,
      error: 'Unknown validation error',
    };
  }
}

/**
 * Creates a typed API error response
 */
export function createApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a typed API success response
 */
export function createApiSuccess<T>(
  data: T,
  message?: string
): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}
