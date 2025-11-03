/**
 * Live Task API Tests
 * Tests against the actual API to validate real responses
 * These tests require authentication and will hit the real API
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Test configuration
const API_BASE_URL = 'https://api.myvideoresu.me';
const TEST_ENDPOINT = '/api/task';

// Helper function to make authenticated API calls
async function makeApiCall(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      // Note: In real tests, we'd need a valid auth token
      // For now, we'll test the unauthenticated response
      ...options.headers,
    },
  });

  // Clone the response first to read both text and JSON
  const responseClone = response.clone();
  const text = await response.text();
  let data = null;

  try {
    if (text && response.status !== 204) {
      data = JSON.parse(text);
    }
  } catch (e) {
    // If JSON parsing fails, data remains null
  }

  return {
    status: responseClone.status,
    statusText: responseClone.statusText,
    headers: Object.fromEntries(responseClone.headers.entries()),
    data,
    text,
  };
}

describe('Live Task API Tests', () => {
  describe('GET /api/task - Unauthenticated', () => {
    it('should return 401 Unauthorized when no auth token provided', async () => {
      const response = await makeApiCall(TEST_ENDPOINT, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      expect(response.statusText).toBe('Unauthorized');
      
      // Validate error response structure
      if (response.data) {
        expect(response.data).toHaveProperty('success');
        expect(response.data.success).toBe(false);
        // Accept new structured error or legacy fields
        if ('error' in response.data) {
          expect(response.data.error).toHaveProperty('code');
          expect(response.data.error).toHaveProperty('message');
        } else {
          expect(response.data).toHaveProperty('errorMessage');
          expect(response.data).toHaveProperty('errorCode');
        }
      }
    });

    it('should return proper error structure for 401', async () => {
      const response = await makeApiCall(TEST_ENDPOINT, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      
      if (response.data) {
        // Validate ApiResponse<List<TaskDTO>> error structure (new or legacy)
        expect(response.data).toHaveProperty('success', false);
        expect(response.data).toHaveProperty('data');
        if ('error' in response.data) {
          expect(response.data.error).toMatchObject({
            code: expect.any(String),
            message: expect.any(String),
          });
        } else {
          expect(response.data).toMatchObject({
            errorMessage: expect.any(String),
            errorCode: expect.any(String),
          });
        }
      }
    });
  });

  describe('Response Analysis', () => {
    it('should analyze response headers and content type', async () => {
      const response = await makeApiCall(TEST_ENDPOINT, {
        method: 'GET',
      });

      // Check content type
      expect(response.headers['content-type']).toContain('application/json');
      
      // Check for CORS headers
      expect(response.headers).toHaveProperty('access-control-allow-origin');
      
      // Log full response for debugging
      console.log('API Response Analysis:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        dataType: typeof response.data,
        dataContent: response.data,
        textLength: response.text.length,
        textPreview: response.text.substring(0, 200),
      });
    });

    it('should validate response is not empty when status is 200', async () => {
      // This test will help us understand what happens with a 200 response
      const response = await makeApiCall(TEST_ENDPOINT, {
        method: 'GET',
        headers: {
          // We'd need a valid token here for a real test
          'Authorization': 'Bearer invalid-token-for-testing',
        },
      });

      if (response.status === 200) {
        // If we get a 200, the response should not be empty
        expect(response.text).not.toBe('');
        expect(response.data).not.toBeNull();
        
        // Should have ApiResponse structure
        expect(response.data).toHaveProperty('success');
        expect(response.data).toHaveProperty('data');
        
        if (response.data.success) {
          // Data should be an array (even if empty)
          expect(Array.isArray(response.data.data)).toBe(true);
        }
      }
    });
  });

  describe('API Contract Validation', () => {
    it('should validate API endpoint exists and responds', async () => {
      const response = await makeApiCall(TEST_ENDPOINT, {
        method: 'GET',
      });

      // Should not be 404 (endpoint exists)
      expect(response.status).not.toBe(404);
      
      // Should be either 401 (auth required) or 200 (success)
      expect([200, 401]).toContain(response.status);
    });

    it('should validate API accepts GET method', async () => {
      const response = await makeApiCall(TEST_ENDPOINT, {
        method: 'GET',
      });

      // Should not be 405 Method Not Allowed
      expect(response.status).not.toBe(405);
    });

    it('should validate API returns JSON content type', async () => {
      const response = await makeApiCall(TEST_ENDPOINT, {
        method: 'GET',
      });

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Error Response Validation', () => {
    it('should validate error responses follow ApiResponse pattern', async () => {
      const response = await makeApiCall(TEST_ENDPOINT, {
        method: 'GET',
      });

      if (response.status >= 400) {
        expect(response.data).toBeTruthy();
        expect(response.data).toHaveProperty('success');
        expect(response.data.success).toBe(false);
        if ('error' in response.data) {
          expect(response.data.error).toHaveProperty('code');
          expect(response.data.error).toHaveProperty('message');
        } else {
          expect(response.data).toHaveProperty('errorMessage');
          expect(response.data).toHaveProperty('errorCode');
        }
      }
    });
  });

  describe('Debugging Empty Response Issue', () => {
    it('should capture and analyze any empty response scenarios', async () => {
      const response = await makeApiCall(TEST_ENDPOINT, {
        method: 'GET',
      });

      // Log everything for debugging the empty response issue
      console.log('=== DEBUGGING EMPTY RESPONSE ===');
      console.log('Status:', response.status);
      console.log('Status Text:', response.statusText);
      console.log('Headers:', response.headers);
      console.log('Raw Text Length:', response.text.length);
      console.log('Raw Text:', response.text);
      console.log('Parsed Data:', response.data);
      console.log('Data Type:', typeof response.data);
      console.log('Is Data Null:', response.data === null);
      console.log('Is Data Undefined:', response.data === undefined);
      console.log('Is Data Empty Object:', JSON.stringify(response.data) === '{}');
      console.log('Is Data Empty Array:', Array.isArray(response.data) && response.data.length === 0);
      console.log('================================');

      // The test passes regardless - we're just capturing data
      expect(true).toBe(true);
    });
  });
});
