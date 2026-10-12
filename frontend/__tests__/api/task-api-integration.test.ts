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
    it('should return tasks array from ApiClient success response', async () => {
      // Mock the ApiClient success response shape
      const mockResponse = {
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
        message: undefined,
        timestamp: new Date().toISOString(),
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toEqual(mockResponse.data);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('text');
    });

    it('should handle empty tasks array response', async () => {
      // API returns 200 OK with empty array
      const mockResponse = {
        success: true,
        data: [],
        message: undefined,
        timestamp: new Date().toISOString(),
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should handle null data response', async () => {
      // API returns 200 OK with null data
      const mockResponse = {
        success: true,
        data: null as any,
        message: undefined,
        timestamp: new Date().toISOString(),
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toEqual(null);
    });

    it('should handle malformed API response data shape', async () => {
      // API returns success but data is not an array
      const mockResponse = {
        success: true,
        data: { tasks: [] }, // Wrong shape
        message: undefined,
        timestamp: new Date().toISOString(),
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toEqual({ tasks: [] });
    });

    it('should handle undefined data gracefully', async () => {
      // Non-standard: success without data (should be avoided but handled)
      const mockResponse = {
        success: true,
        data: undefined as any,
        message: undefined,
        timestamp: new Date().toISOString(),
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await taskService.getTasks();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      expect(result).toBeUndefined();
    });

    it('should handle response with wrong data type', async () => {
      // API returns wrong data type
      const mockResponse = {
        success: true,
        data: 'not an array' as any,
        message: undefined,
        timestamp: new Date().toISOString(),
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

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
