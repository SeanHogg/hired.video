/**
 * Tests for error handling system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  NetworkError,
  normalizeError,
  handleError,
  safeAsync,
  safeSync,
  validateOrThrow,
  validateSafe,
} from './errors';

describe('Error System', () => {
  describe('AppError', () => {
    it('should create error with proper properties', () => {
      class TestError extends AppError {
        readonly code = 'TEST_ERROR';
        readonly statusCode = 400;
      }

      const error = new TestError('Test message', { context: 'test' });

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.context).toEqual({ context: 'test' });
      expect(error.timestamp).toBeDefined();
      expect(error.name).toBe('TestError');
    });

    it('should convert to JSON correctly', () => {
      class TestError extends AppError {
        readonly code = 'TEST_ERROR';
        readonly statusCode = 400;
      }

      const error = new TestError('Test message');
      const json = error.toJSON();

      expect(json).toMatchObject({
        name: 'TestError',
        code: 'TEST_ERROR',
        message: 'Test message',
        statusCode: 400,
        timestamp: expect.any(String),
      });
    });
  });

  describe('ValidationError', () => {
    it('should create from Zod error', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      try {
        schema.parse({ name: 123, age: 'invalid' });
      } catch (zodError) {
        const validationError = ValidationError.fromZodError(zodError as z.ZodError);

        expect(validationError).toBeInstanceOf(ValidationError);
        expect(validationError.code).toBe('VALIDATION_ERROR');
        expect(validationError.statusCode).toBe(400);
        expect(validationError.message).toContain('Validation failed');
        expect(validationError.validationErrors).toBeDefined();
      }
    });
  });

  describe('normalizeError', () => {
    it('should return AppError as-is', () => {
      const originalError = new AuthenticationError('Auth failed');
      const normalized = normalizeError(originalError);

      expect(normalized).toBe(originalError);
    });

    it('should convert Zod error to ValidationError', () => {
      const schema = z.string();
      
      try {
        schema.parse(123);
      } catch (zodError) {
        const normalized = normalizeError(zodError);

        expect(normalized).toBeInstanceOf(ValidationError);
        expect(normalized.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should convert standard Error to InternalError', () => {
      const originalError = new Error('Standard error');
      const normalized = normalizeError(originalError);

      expect(normalized.code).toBe('INTERNAL_ERROR');
      expect(normalized.message).toBe('Standard error');
    });

    it('should convert string to InternalError', () => {
      const normalized = normalizeError('String error');

      expect(normalized.code).toBe('INTERNAL_ERROR');
      expect(normalized.message).toBe('String error');
    });

    it('should handle unknown error types', () => {
      const normalized = normalizeError({ unknown: 'object' });

      expect(normalized.code).toBe('INTERNAL_ERROR');
      expect(normalized.message).toBe('An unknown error occurred');
    });
  });

  describe('handleError', () => {
    it('should determine correct logging behavior', () => {
      const validationError = new ValidationError('Validation failed');
      const networkError = new NetworkError('Network failed');

      const validationResult = handleError(validationError);
      const networkResult = handleError(networkError);

      expect(validationResult.shouldLog).toBe(false);
      expect(validationResult.shouldReport).toBe(false);
      expect(validationResult.userMessage).toBe('Please check your input and try again.');

      expect(networkResult.shouldLog).toBe(true);
      expect(networkResult.shouldReport).toBe(true);
      expect(networkResult.userMessage).toBe('Network error. Please check your connection and try again.');
    });
  });

  describe('safeAsync', () => {
    it('should return success result for successful function', async () => {
      const successFn = safeAsync(async (x: number) => x * 2);
      const result = await successFn(5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(10);
      }
    });

    it('should return error result for failing function', async () => {
      const failingFn = safeAsync(async () => {
        throw new Error('Async error');
      });
      const result = await failingFn();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as { success: false; error: AppError }).error.message).toBe('Async error');
      }
    });
  });

  describe('safeSync', () => {
    it('should return success result for successful function', () => {
      const successFn = safeSync((x: number) => x * 2);
      const result = successFn(5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(10);
      }
    });

    it('should return error result for failing function', () => {
      const failingFn = safeSync(() => {
        throw new Error('Sync error');
      });
      const result = failingFn();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as { success: false; error: AppError }).error.message).toBe('Sync error');
      }
    });
  });

  describe('validateOrThrow', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    it('should return validated data for valid input', () => {
      const input = { name: 'John', age: 30 };
      const result = validateOrThrow(input, schema);

      expect(result).toEqual(input);
    });

    it('should throw ValidationError for invalid input', () => {
      const input = { name: 123, age: 'invalid' };

      expect(() => validateOrThrow(input, schema)).toThrow(ValidationError);
    });
  });

  describe('validateSafe', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    it('should return success result for valid input', () => {
      const input = { name: 'John', age: 30 };
      const result = validateSafe(input, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it('should return error result for invalid input', () => {
      const input = { name: 123, age: 'invalid' };
      const result = validateSafe(input, schema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as { success: false; error: ValidationError }).error).toBeInstanceOf(ValidationError);
      }
    });
  });
});
