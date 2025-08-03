/**
 * Tests for API client
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { ApiClient } from './api-client';
import { NetworkError, ValidationError, AuthenticationError } from './errors';
import { mockFetch } from './test-utils';

// Mock fetch globally
const mockFetchFn = mockFetch();
global.fetch = mockFetchFn;

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient({
      baseUrl: 'http://localhost:3000/api',
      timeout: 5000,
      retries: 2,
    });
    
    mockFetchFn.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultClient = new ApiClient();
      expect(defaultClient).toBeInstanceOf(ApiClient);
    });

    it('should initialize with custom config', () => {
      const customClient = new ApiClient({
        baseUrl: 'https://api.example.com',
        timeout: 10000,
        retries: 5,
        headers: { 'Custom-Header': 'value' },
      });
      
      expect(customClient).toBeInstanceOf(ApiClient);
    });
  });

  describe('interceptors', () => {
    it('should add and apply request interceptors', async () => {
      const requestInterceptor = vi.fn().mockImplementation(config => ({
        ...config,
        headers: { ...config.headers, 'X-Custom': 'test' },
      }));

      client.addRequestInterceptor(requestInterceptor);

      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { message: 'test' },
        }),
      });

      await client.get('/test');

      expect(requestInterceptor).toHaveBeenCalled();
      expect(mockFetchFn).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'test',
          }),
        })
      );
    });

    it('should add and apply response interceptors', async () => {
      const responseInterceptor = vi.fn().mockImplementation(response => ({
        ...response,
        data: { ...response.data, intercepted: true },
      }));

      client.addResponseInterceptor(responseInterceptor);

      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { message: 'test' },
        }),
      });

      const response = await client.get('/test');

      expect(responseInterceptor).toHaveBeenCalled();
      expect(response.data).toEqual({
        message: 'test',
        intercepted: true,
      });
    });

    it('should add and apply error interceptors', async () => {
      const errorInterceptor = vi.fn().mockImplementation(error => error);

      client.addErrorInterceptor(errorInterceptor);

      mockFetchFn.mockRejectedValueOnce(new Error('Network error'));

      try {
        await client.get('/test');
      } catch (error) {
        expect(errorInterceptor).toHaveBeenCalled();
        expect(error).toBeInstanceOf(NetworkError);
      }
    });
  });

  describe('HTTP methods', () => {
    const mockResponse = {
      success: true,
      data: { id: 1, name: 'Test' },
    };

    beforeEach(() => {
      mockFetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });
    });

    it('should make GET request', async () => {
      const response = await client.get('/users');

      expect(mockFetchFn).toHaveBeenCalledWith(
        'http://localhost:3000/api/users',
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(response.data).toEqual(mockResponse.data);
    });

    it('should make POST request', async () => {
      const postData = { name: 'New User' };
      const response = await client.post('/users', postData);

      expect(mockFetchFn).toHaveBeenCalledWith(
        'http://localhost:3000/api/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(postData),
        })
      );
      expect(response.data).toEqual(mockResponse.data);
    });

    it('should make PUT request', async () => {
      const putData = { name: 'Updated User' };
      const response = await client.put('/users/1', putData);

      expect(mockFetchFn).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(putData),
        })
      );
      expect(response.data).toEqual(mockResponse.data);
    });

    it('should make PATCH request', async () => {
      const patchData = { name: 'Patched User' };
      const response = await client.patch('/users/1', patchData);

      expect(mockFetchFn).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(patchData),
        })
      );
      expect(response.data).toEqual(mockResponse.data);
    });

    it('should make DELETE request', async () => {
      const response = await client.delete('/users/1');

      expect(mockFetchFn).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(response.data).toEqual(mockResponse.data);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      mockFetchFn.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.get('/test')).rejects.toThrow(NetworkError);
    });

    it('should handle HTTP error status codes', async () => {
      mockFetchFn.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Unauthorized',
          },
        }),
      });

      await expect(client.get('/test')).rejects.toThrow(AuthenticationError);
    });

    it('should handle invalid JSON responses', async () => {
      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(client.get('/test')).rejects.toThrow(NetworkError);
    });

    it('should handle timeout errors', async () => {
      vi.useFakeTimers();

      const timeoutClient = new ApiClient({ timeout: 1000 });

      mockFetchFn.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      const requestPromise = timeoutClient.get('/test');

      vi.advanceTimersByTime(1500);

      await expect(requestPromise).rejects.toThrow(NetworkError);

      vi.useRealTimers();
    });
  });

  describe('validation', () => {
    it('should validate response data with schema', async () => {
      const schema = z.object({
        id: z.number(),
        name: z.string(),
      });

      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { id: 1, name: 'Test' },
        }),
      });

      const response = await client.get('/test', schema);

      expect(response.data).toEqual({ id: 1, name: 'Test' });
    });

    it('should throw ValidationError for invalid response data', async () => {
      const schema = z.object({
        id: z.number(),
        name: z.string(),
      });

      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { id: 'invalid', name: 123 },
        }),
      });

      await expect(client.get('/test', schema)).rejects.toThrow(ValidationError);
    });
  });

  describe('retries', () => {
    it('should retry failed requests', async () => {
      vi.useFakeTimers();

      mockFetchFn
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            data: { message: 'success' },
          }),
        });

      const requestPromise = client.get('/test');

      // Advance timers to trigger retries
      vi.advanceTimersByTime(5000);

      const response = await requestPromise;

      expect(mockFetchFn).toHaveBeenCalledTimes(3);
      expect(response.data).toEqual({ message: 'success' });

      vi.useRealTimers();
    });

    it('should not retry validation errors', async () => {
      mockFetchFn.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
          },
        }),
      });

      await expect(client.get('/test')).rejects.toThrow(ValidationError);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });
  });
});
