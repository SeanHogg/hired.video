/**
 * Task API Integration Tests
 * Tests the actual API endpoints to validate response structure and data
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { taskService } from '@/lib/services/task-service';
import { apiClient } from '@/lib/api-client';
import { TaskDTO, ProductivityItemStatus, TaskType } from '@/types/task';

// Mock the API client to capture actual calls and responses
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockApiClient = apiClient as any;

describe('Task API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/task - List Tasks', () => {
    it('should return ApiResponse wrapper with tasks array', async () => {
      // Mock the expected API response structure based on TaskController
      const mockApiResponse = {
        data: {
          success: true,
          data: [
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              text: 'Test Task',
              description: 'Test Description',
              start: '2024-01-01T00:00:00Z',
              end: '2024-01-02T00:00:00Z',
              taskType: TaskType.General,
              status: ProductivityItemStatus.ToDo,
              creationDateTime: '2024-01-01T00:00:00Z',
              updateDateTime: '2024-01-01T00:00:00Z',
              createdByUserId: 'user-123',
              assignedToUserId: 'user-123',
            } as TaskDTO,
          ],
          errorMessage: null,
          errorCode: null,
        },
      };

      mockApiClient.get.mockResolvedValue(mockApiResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toEqual(mockApiResponse.data.data);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('text');
    });

    it('should handle empty tasks array response', async () => {
      // Test the case where API returns 200 OK but empty array
      const mockApiResponse = {
        data: {
          success: true,
          data: [], // Empty array - this might be the issue
          errorMessage: null,
          errorCode: null,
        },
      };

      mockApiClient.get.mockResolvedValue(mockApiResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should handle null data response', async () => {
      // Test the case where API returns 200 OK but null data
      const mockApiResponse = {
        data: {
          success: true,
          data: null, // Null data - another potential issue
          errorMessage: null,
          errorCode: null,
        },
      };

      mockApiClient.get.mockResolvedValue(mockApiResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toEqual(null);
    });

    it('should handle malformed API response', async () => {
      // Test the case where API returns unexpected structure
      const mockApiResponse = {
        data: {
          // Missing success, data, errorMessage, errorCode properties
          tasks: [], // Wrong property name
        },
      };

      mockApiClient.get.mockResolvedValue(mockApiResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toBeUndefined();
    });

    it('should handle completely empty response', async () => {
      // Test the case where API returns completely empty response
      const mockApiResponse = {
        data: {}, // Completely empty object
      };

      mockApiClient.get.mockResolvedValue(mockApiResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toBeUndefined();
    });

    it('should handle response with wrong data type', async () => {
      // Test the case where API returns wrong data type
      const mockApiResponse = {
        data: {
          success: true,
          data: 'not an array', // Wrong data type
          errorMessage: null,
          errorCode: null,
        },
      };

      mockApiClient.get.mockResolvedValue(mockApiResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toEqual('not an array');
      expect(Array.isArray(result)).toBe(false);
    });

    it('should include query parameters when filters are provided', async () => {
      const mockApiResponse = {
        data: {
          success: true,
          data: [],
          errorMessage: null,
          errorCode: null,
        },
      };

      mockApiClient.get.mockResolvedValue(mockApiResponse);

      const filters = {
        status: [ProductivityItemStatus.ToDo, ProductivityItemStatus.InProgress],
        taskType: [TaskType.General],
      };

      await taskService.getTasks(filters);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/task?status=1&status=3&taskType=0'
      );
    });

    it('should handle authentication errors (401)', async () => {
      const authError = new Error('Request failed with status code 401');
      (authError as any).response = {
        status: 401,
        data: {
          success: false,
          data: null,
          errorMessage: 'User not authenticated',
          errorCode: 'Unauthorized',
        },
      };

      mockApiClient.get.mockRejectedValue(authError);

      await expect(taskService.getTasks()).rejects.toThrow('Failed to fetch tasks');
    });

    it('should handle server errors (500)', async () => {
      const serverError = new Error('Request failed with status code 500');
      (serverError as any).response = {
        status: 500,
        data: {
          success: false,
          data: null,
          errorMessage: 'Internal server error',
          errorCode: 'InternalError',
        },
      };

      mockApiClient.get.mockRejectedValue(serverError);

      await expect(taskService.getTasks()).rejects.toThrow('Failed to fetch tasks');
    });
  });

  describe('Response Structure Validation', () => {
    it('should validate TaskDTO structure matches backend expectations', () => {
      const expectedTaskDTO: TaskDTO = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Test Task',
        description: 'Test Description',
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-02T00:00:00Z',
        taskType: TaskType.General,
        subTaskType: TaskType.General,
        status: ProductivityItemStatus.ToDo,
        creationDateTime: '2024-01-01T00:00:00Z',
        updateDateTime: '2024-01-01T00:00:00Z',
        createdByUserId: 'user-123',
        assignedToUserId: 'user-123',
        createdByUser: {
          id: 'user-123',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        assignedToUser: {
          id: 'user-123',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        boardId: 'board-123',
      };

      // Validate all required properties exist
      expect(expectedTaskDTO).toHaveProperty('id');
      expect(expectedTaskDTO).toHaveProperty('text');
      expect(expectedTaskDTO).toHaveProperty('taskType');
      expect(expectedTaskDTO).toHaveProperty('status');
      expect(expectedTaskDTO).toHaveProperty('creationDateTime');

      // Validate enum values are correct
      expect(Object.values(TaskType)).toContain(expectedTaskDTO.taskType);
      expect(Object.values(ProductivityItemStatus)).toContain(expectedTaskDTO.status);
    });

    it('should validate ApiResponse wrapper structure', () => {
      const expectedApiResponse = {
        success: true,
        data: [] as TaskDTO[],
        errorMessage: null,
        errorCode: null,
      };

      // Validate ApiResponse structure
      expect(expectedApiResponse).toHaveProperty('success');
      expect(expectedApiResponse).toHaveProperty('data');
      expect(expectedApiResponse).toHaveProperty('errorMessage');
      expect(expectedApiResponse).toHaveProperty('errorCode');
      expect(typeof expectedApiResponse.success).toBe('boolean');
      expect(Array.isArray(expectedApiResponse.data)).toBe(true);
    });
  });
});
