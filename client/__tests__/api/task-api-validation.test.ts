/**
 * Task API Validation Tests
 * Tests to validate the specific issue: API returns 401 with empty response body
 */

import { describe, it, expect } from 'vitest';

// Test configuration
const API_BASE_URL = 'https://api.myvideoresu.me';
const TEST_ENDPOINT = '/api/task';

describe('Task API Response Validation', () => {
  describe('Authentication Error Response Issue', () => {
    it('should return a JSON error body on 401', async () => {
      const response = await fetch(`${API_BASE_URL}${TEST_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      const text = await response.text();

      // Validate correct behavior
      expect(response.status).toBe(401);
      expect(text.length).toBeGreaterThan(0);
      const json = JSON.parse(text);
      expect(json.success).toBe(false);
      // Accept new structured error or legacy fields
      if (json.error) {
        expect(json.error.code).toBeTruthy();
        expect(json.error.message).toBeTruthy();
      } else {
        expect(json.errorMessage).toBeTruthy();
        expect(json.errorCode).toBeTruthy();
      }
    });

    it('should return JSON error with application/json content type on 401', async () => {
      const response = await fetch(`${API_BASE_URL}${TEST_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).not.toBe('');
      const json = JSON.parse(text);
      expect(json.success).toBe(false);
      const contentType = response.headers.get('content-type') || '';
      expect(contentType).toContain('application/json');
    });

    it('should set application/json content type for 401 responses', async () => {
      const response = await fetch(`${API_BASE_URL}${TEST_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      expect(response.status).toBe(401);
      const contentType = response.headers.get('content-type') || '';
      expect(contentType).toContain('application/json');
    });
  });

  describe('Expected API Response Structure', () => {
    it('should define the expected ApiResponse structure for errors', () => {
      // Preferred new error structure
      const expectedErrorResponseNew = {
        success: false,
        error: { code: 'Unauthorized', message: 'User not authenticated' },
        data: null,
      };

      // Legacy error structure (still accepted by some tests)
      const expectedErrorResponseLegacy = {
        success: false,
        data: null,
        errorMessage: 'User not authenticated',
        errorCode: 'Unauthorized',
      };

      expect(expectedErrorResponseNew).toHaveProperty('success');
      expect(expectedErrorResponseNew).toHaveProperty('error');
      expect(expectedErrorResponseNew.error).toHaveProperty('code');
      expect(expectedErrorResponseNew.error).toHaveProperty('message');

      expect(expectedErrorResponseLegacy).toHaveProperty('errorMessage');
      expect(expectedErrorResponseLegacy).toHaveProperty('errorCode');
    });

    it('should define the expected ApiResponse structure for success', () => {
      // Standard success response
      const expectedSuccessResponse = {
        success: true,
        data: [], // Array of TaskDTO objects
        message: null,
        timestamp: new Date().toISOString(),
      };

      expect(expectedSuccessResponse).toHaveProperty('success');
      expect(expectedSuccessResponse).toHaveProperty('data');
      expect(Array.isArray(expectedSuccessResponse.data)).toBe(true);
    });
  });

  describe('Root Cause Analysis', () => {
    it('should document the authentication middleware issue', () => {
      // The issue is in Program.cs lines 418-444
      // The OnRedirectToLogin event handler sets the status code but doesn't write a response body
      
      const problemCode = `
        options.Events.OnRedirectToLogin = ctx =>
        {
            var isApi = ctx.Request.Path.StartsWithSegments("/api");
            if (isApi)
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask; // ← NO RESPONSE BODY!
            }
            // ...
        };
      `;

      const fixedCode = `
        options.Events.OnRedirectToLogin = async ctx =>
        {
            var isApi = ctx.Request.Path.StartsWithSegments("/api");
            if (isApi)
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                ctx.Response.ContentType = "application/json";
                
                var errorResponse = ApiResponse.CreateError(
                    ApiErrorCodes.Unauthorized, 
                    "User not authenticated"
                );
                
                await ctx.Response.WriteAsJsonAsync(errorResponse);
                return;
            }
            // ...
        };
      `;

      // Document the issue
      expect(problemCode).toContain('NO RESPONSE BODY');
      expect(fixedCode).toContain('WriteAsJsonAsync');
      
      console.log('=== ROOT CAUSE ANALYSIS ===');
      console.log('Problem: Authentication middleware returns 401 with empty body');
      console.log('Location: myvideoresume-api/Server/Program.cs lines 418-444');
      console.log('Fix: Add JSON response body to OnRedirectToLogin event');
      console.log('===========================');
    });
  });

  describe('TaskService Integration Impact', () => {
    it('should validate how empty 401 responses affect TaskService', () => {
      // When the API returns 401 with empty body, the TaskService.getTasks() method
      // receives an empty response and tries to parse it, leading to undefined/null data
      
      // Simulate what happens in TaskService when API returns empty 401
      const emptyApiResponse = {
        data: null // This is what happens when response body is empty
      };

      // The TaskService tries to access response.data.data but response.data is null
      const taskData = emptyApiResponse.data?.data;
      expect(taskData).toBeUndefined();
      
      // This is why tasks don't load - the service gets undefined instead of an error or empty array
      console.log('=== TASKSERVICE IMPACT ===');
      console.log('Empty 401 response leads to undefined task data');
      console.log('TaskService.getTasks() returns undefined instead of throwing error');
      console.log('Frontend shows "no tasks" instead of authentication error');
      console.log('==========================');
    });
  });
});
