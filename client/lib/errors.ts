/**
 * Comprehensive error handling system
 * Provides structured error types, error boundaries, and error utilities
 */

import { z } from 'zod';

// ============================================================================
// ERROR TYPES AND CLASSES
// ============================================================================

/**
 * Base application error class
 */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly timestamp: string;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.context = context;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts error to JSON for logging/API responses
   */
  toJSON(): ErrorJSON {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Validation error - for invalid input data
 */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(
    message: string,
    public readonly validationErrors?: z.ZodError,
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }

  /**
   * Creates ValidationError from Zod error
   */
  static fromZodError(zodError: z.ZodError, context?: Record<string, unknown>): ValidationError {
    const message = zodError.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
    return new ValidationError(`Validation failed: ${message}`, zodError, context);
  }
}

/**
 * Authentication error - for auth failures
 */
export class AuthenticationError extends AppError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;
}

/**
 * Authorization error - for permission failures
 */
export class AuthorizationError extends AppError {
  readonly code = 'AUTHORIZATION_ERROR';
  readonly statusCode = 403;
}

/**
 * Not found error - for missing resources
 */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND_ERROR';
  readonly statusCode = 404;
}

/**
 * Conflict error - for resource conflicts
 */
export class ConflictError extends AppError {
  readonly code = 'CONFLICT_ERROR';
  readonly statusCode = 409;
}

/**
 * Network error - for network/API failures
 */
export class NetworkError extends AppError {
  readonly code = 'NETWORK_ERROR';
  readonly statusCode = 500;

  constructor(
    message: string,
    public readonly originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }
}

/**
 * Internal error - for unexpected application errors
 */
export class InternalError extends AppError {
  readonly code = 'INTERNAL_ERROR';
  readonly statusCode = 500;

  constructor(
    message: string,
    public readonly originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }
}

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Error JSON representation
 */
export interface ErrorJSON {
  name: string;
  code: string;
  message: string;
  statusCode: number;
  timestamp: string;
  context?: Record<string, unknown>;
  stack?: string;
}

/**
 * Error handler result
 */
export interface ErrorHandlerResult {
  error: AppError;
  shouldLog: boolean;
  shouldReport: boolean;
  userMessage: string;
}

/**
 * Converts unknown error to AppError
 */
export function normalizeError(error: unknown, context?: Record<string, unknown>): AppError {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // Zod validation error
  if (error instanceof z.ZodError) {
    return ValidationError.fromZodError(error, context);
  }

  // Standard Error
  if (error instanceof Error) {
    return new InternalError(error.message, error, context);
  }

  // String error
  if (typeof error === 'string') {
    return new InternalError(error, undefined, context);
  }

  // Unknown error type
  return new InternalError('An unknown error occurred', undefined, { 
    ...context, 
    originalError: error 
  });
}

/**
 * Handles errors and determines appropriate response
 */
export function handleError(error: unknown, context?: Record<string, unknown>): ErrorHandlerResult {
  const normalizedError = normalizeError(error, context);

  // Determine logging and reporting behavior
  const shouldLog = normalizedError.statusCode >= 500;
  const shouldReport = normalizedError.statusCode >= 500;

  // Generate user-friendly message
  let userMessage: string;
  switch (normalizedError.code) {
    case 'VALIDATION_ERROR':
      userMessage = 'Please check your input and try again.';
      break;
    case 'AUTHENTICATION_ERROR':
      userMessage = 'Please sign in to continue.';
      break;
    case 'AUTHORIZATION_ERROR':
      userMessage = 'You do not have permission to perform this action.';
      break;
    case 'NOT_FOUND_ERROR':
      userMessage = 'The requested resource was not found.';
      break;
    case 'CONFLICT_ERROR':
      userMessage = 'This action conflicts with existing data.';
      break;
    case 'NETWORK_ERROR':
      userMessage = 'Network error. Please check your connection and try again.';
      break;
    default:
      userMessage = 'An unexpected error occurred. Please try again.';
  }

  return {
    error: normalizedError,
    shouldLog,
    shouldReport,
    userMessage,
  };
}

/**
 * Safe async function wrapper that handles errors
 */
export function safeAsync<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<{ success: true; data: R } | { success: false; error: AppError }> {
  return async (...args: T) => {
    try {
      const data = await fn(...args);
      return { success: true, data };
    } catch (error) {
      const normalizedError = normalizeError(error);
      return { success: false, error: normalizedError };
    }
  };
}

/**
 * Safe sync function wrapper that handles errors
 */
export function safeSync<T extends unknown[], R>(
  fn: (...args: T) => R
): (...args: T) => { success: true; data: R } | { success: false; error: AppError } {
  return (...args: T) => {
    try {
      const data = fn(...args);
      return { success: true, data };
    } catch (error) {
      const normalizedError = normalizeError(error);
      return { success: false, error: normalizedError };
    }
  };
}

/**
 * Validates data against schema and throws ValidationError on failure
 */
export function validateOrThrow<T>(data: unknown, schema: z.ZodSchema<T>, context?: Record<string, unknown>): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ValidationError.fromZodError(error, context);
    }
    throw normalizeError(error, context);
  }
}

/**
 * Validates data against schema and returns result
 */
export function validateSafe<T>(
  data: unknown, 
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: ValidationError } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: ValidationError.fromZodError(error) };
    }
    return { success: false, error: normalizeError(error) as ValidationError };
  }
}
