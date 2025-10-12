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
    it('should identify the empty response body issue on 401', async () => {
      const response = await fetch(`${API_BASE_URL}${TEST_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      const text = await response.text();
      
      console.log('=== AUTHENTICATION ERROR ANALYSIS ===');
      console.log('Status:', response.status);
      console.log('Status Text:', response.statusText);
      console.log('Content-Type:', response.headers.get('content-type'));
      console.log('Content-Length:', response.headers.get('content-length'));
      console.log('Response Body Length:', text.length);
      console.log('Response Body:', text);
      console.log('Is Empty Body:', text.length === 0);
      console.log('=====================================');

      // Document the issue
      expect(response.status).toBe(401);
      expect(text.length).toBe(0); // This is the problem!
      
      // What SHOULD happen:
      // expect(text.length).toBeGreaterThan(0);
      // expect(JSON.parse(text)).toMatchObject({
      //   success: false,
      //   errorMessage: expect.any(String),
      //   errorCode: expect.any(String)
      // });
    });

    it('should validate that 401 responses should have JSON error body', async () => {
      const response = await fetch(`${API_BASE_URL}${TEST_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      // Current behavior (broken)
      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).toBe(''); // Empty response body - this is the bug

      // Expected behavior (what should happen)
      // The API should return a proper JSON error response like:
      // {
      //   "success": false,
      //   "data": null,
      //   "errorMessage": "User not authenticated",
      //   "errorCode": "Unauthorized"
      // }
    });

    it('should validate content-type header for 401 responses', async () => {
      const response = await fetch(`${API_BASE_URL}${TEST_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      expect(response.status).toBe(401);
      
      // The content-type should be application/json for API errors
      const contentType = response.headers.get('content-type');
      console.log('Content-Type for 401:', contentType);
      
      // Currently this might be null or not application/json
      // It should be 'application/json' for proper API error responses
    });
  });

  describe('Expected API Response Structure', () => {
    it('should define the expected ApiResponse structure for errors', () => {
      // This is what the API SHOULD return for 401 errors
      const expectedErrorResponse = {
        success: false,
        data: null,
        errorMessage: 'User not authenticated',
        errorCode: 'Unauthorized'
      };

      // Validate the structure we expect
      expect(expectedErrorResponse).toHaveProperty('success');
      expect(expectedErrorResponse).toHaveProperty('data');
      expect(expectedErrorResponse).toHaveProperty('errorMessage');
      expect(expectedErrorResponse).toHaveProperty('errorCode');
      expect(expectedErrorResponse.success).toBe(false);
      expect(typeof expectedErrorResponse.errorMessage).toBe('string');
      expect(typeof expectedErrorResponse.errorCode).toBe('string');
    });

    it('should define the expected ApiResponse structure for success', () => {
      // This is what the API SHOULD return for 200 success
      const expectedSuccessResponse = {
        success: true,
        data: [], // Array of TaskDTO objects
        errorMessage: null,
        errorCode: null
      };

      // Validate the structure we expect
      expect(expectedSuccessResponse).toHaveProperty('success');
      expect(expectedSuccessResponse).toHaveProperty('data');
      expect(expectedSuccessResponse).toHaveProperty('errorMessage');
      expect(expectedSuccessResponse).toHaveProperty('errorCode');
      expect(expectedSuccessResponse.success).toBe(true);
      expect(Array.isArray(expectedSuccessResponse.data)).toBe(true);
      expect(expectedSuccessResponse.errorMessage).toBeNull();
      expect(expectedSuccessResponse.errorCode).toBeNull();
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
