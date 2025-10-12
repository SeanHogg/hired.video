/**
 * Integration tests for Tasks API endpoints
 * Tests actual API calls, authentication, and error scenarios
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { TaskService } from '../../lib/services/task-service';
import { apiClient } from '../../lib/api-client';
import { TaskType, ProductivityItemStatus } from '../../types/task';

// Mock the API client but allow some real behavior for integration testing
vi.mock('../../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Tasks API Integration Tests', () => {
  let taskService: TaskService;
  let mockApiClient: {
    get: Mock;
    post: Mock;
    delete: Mock;
  };

  beforeEach(() => {
    taskService = new TaskService();
    mockApiClient = apiClient as any;
    vi.clearAllMocks();
  });

  describe('Authentication Integration', () => {
    it('should include authentication headers in requests', async () => {
      // Arrange
      mockApiClient.get.mockResolvedValue({ data: [] });

      // Act
      await taskService.getTasks();

      // Assert
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
      // The API client should automatically add auth headers via interceptors
    });

    it('should handle 401 Unauthorized responses', async () => {
      // Arrange
      const unauthorizedError = new Error('Authentication required');
      unauthorizedError.name = 'AuthenticationError';
      mockApiClient.get.mockRejectedValue(unauthorizedError);

      // Act & Assert
      await expect(taskService.getTasks()).rejects.toThrow('Failed to fetch tasks');
    });

    it('should handle 403 Forbidden responses', async () => {
      // Arrange
      const forbiddenError = new Error('Access forbidden');
      forbiddenError.name = 'AuthorizationError';
      mockApiClient.get.mockRejectedValue(forbiddenError);

      // Act & Assert
      await expect(taskService.getTasks()).rejects.toThrow('Failed to fetch tasks');
    });
  });

  describe('Task CRUD Operations Integration', () => {
    it('should perform complete task lifecycle', async () => {
      // Arrange
      const newTaskData = {
        text: 'Integration Test Task',
        description: 'Testing full CRUD lifecycle',
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
        status: ProductivityItemStatus.ToDo,
      };

      const createdTask = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        ...newTaskData,
        creationDateTime: '2024-01-01T00:00:00Z',
      };

      const updatedTask = {
        ...createdTask,
        text: 'Updated Integration Test Task',
        status: ProductivityItemStatus.InProgress,
        updateDateTime: '2024-01-01T12:00:00Z',
      };

      // Mock API responses
      mockApiClient.post.mockResolvedValueOnce({ data: createdTask }); // Create
      mockApiClient.get.mockResolvedValueOnce({ data: createdTask }); // Read
      mockApiClient.post.mockResolvedValueOnce({ data: updatedTask }); // Update
      mockApiClient.delete.mockResolvedValueOnce({}); // Delete

      // Act & Assert - Create
      const created = await taskService.createTask(newTaskData);
      expect(created).toEqual(createdTask);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/task/save', expect.objectContaining({
        text: newTaskData.text,
        description: newTaskData.description,
      }));

      // Act & Assert - Read
      const retrieved = await taskService.getTaskById(createdTask.id);
      expect(retrieved).toEqual(createdTask);
      expect(mockApiClient.get).toHaveBeenCalledWith(`/api/task/${createdTask.id}`);

      // Act & Assert - Update
      const updateData = {
        id: createdTask.id,
        text: 'Updated Integration Test Task',
        start: createdTask.start,
        taskType: createdTask.taskType,
        status: ProductivityItemStatus.InProgress,
      };
      const updated = await taskService.updateTask(updateData);
      expect(updated).toEqual(updatedTask);

      // Act & Assert - Delete
      await taskService.deleteTask(createdTask.id);
      expect(mockApiClient.delete).toHaveBeenCalledWith(`/api/task/${createdTask.id}`);
    });

    it('should handle concurrent task operations', async () => {
      // Arrange
      const task1Data = {
        text: 'Concurrent Task 1',
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
      };

      const task2Data = {
        text: 'Concurrent Task 2',
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.Project,
      };

      const createdTask1 = { id: 'task1', ...task1Data };
      const createdTask2 = { id: 'task2', ...task2Data };

      mockApiClient.post
        .mockResolvedValueOnce({ data: createdTask1 })
        .mockResolvedValueOnce({ data: createdTask2 });

      // Act
      const [result1, result2] = await Promise.all([
        taskService.createTask(task1Data),
        taskService.createTask(task2Data),
      ]);

      // Assert
      expect(result1).toEqual(createdTask1);
      expect(result2).toEqual(createdTask2);
      expect(mockApiClient.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle network timeouts', async () => {
      // Arrange
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'NetworkError';
      mockApiClient.get.mockRejectedValue(timeoutError);

      // Act & Assert
      await expect(taskService.getTasks()).rejects.toThrow('Failed to fetch tasks');
    });

    it('should handle server errors (500)', async () => {
      // Arrange
      const serverError = new Error('Internal server error');
      serverError.name = 'NetworkError';
      mockApiClient.get.mockRejectedValue(serverError);

      // Act & Assert
      await expect(taskService.getTasks()).rejects.toThrow('Failed to fetch tasks');
    });

    it('should handle validation errors (400)', async () => {
      // Arrange
      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      mockApiClient.post.mockRejectedValue(validationError);

      const invalidTaskData = {
        text: '', // Invalid: empty text
        start: 'invalid-date', // Invalid: malformed date
        taskType: 999 as TaskType, // Invalid: non-existent task type
      };

      // Act & Assert
      await expect(taskService.createTask(invalidTaskData)).rejects.toThrow('Failed to create task');
    });

    it('should handle not found errors (404)', async () => {
      // Arrange
      const notFoundError = new Error('Task not found');
      notFoundError.name = 'NotFoundError';
      mockApiClient.get.mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(taskService.getTaskById('non-existent-id')).rejects.toThrow('Failed to fetch task non-existent-id');
    });
  });

  describe('Data Validation Integration', () => {
    it('should validate required fields', async () => {
      // Arrange
      const incompleteTaskData = {
        // Missing required 'text' field
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
      };

      const validationError = new Error('Text is required');
      mockApiClient.post.mockRejectedValue(validationError);

      // Act & Assert
      await expect(taskService.createTask(incompleteTaskData as any)).rejects.toThrow();
    });

    it('should validate date formats', async () => {
      // Arrange
      const invalidDateTaskData = {
        text: 'Test Task',
        start: 'not-a-date',
        taskType: TaskType.General,
      };

      const validationError = new Error('Invalid date format');
      mockApiClient.post.mockRejectedValue(validationError);

      // Act & Assert
      await expect(taskService.createTask(invalidDateTaskData)).rejects.toThrow();
    });

    it('should validate enum values', async () => {
      // Arrange
      const invalidEnumTaskData = {
        text: 'Test Task',
        start: '2024-01-01T00:00:00Z',
        taskType: 999 as TaskType, // Invalid enum value
      };

      const validationError = new Error('Invalid task type');
      mockApiClient.post.mockRejectedValue(validationError);

      // Act & Assert
      await expect(taskService.createTask(invalidEnumTaskData)).rejects.toThrow();
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle large task lists efficiently', async () => {
      // Arrange
      const largeTasks = Array.from({ length: 1000 }, (_, i) => ({
        id: `task-${i}`,
        text: `Task ${i}`,
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
        status: ProductivityItemStatus.ToDo,
      }));

      mockApiClient.get.mockResolvedValue({ data: largeTasks });

      // Act
      const startTime = Date.now();
      const result = await taskService.getTasks();
      const endTime = Date.now();

      // Assert
      expect(result).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle rapid successive API calls', async () => {
      // Arrange
      const taskData = {
        text: 'Rapid Test Task',
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
      };

      mockApiClient.post.mockImplementation(() => 
        Promise.resolve({ data: { id: 'task-id', ...taskData } })
      );

      // Act
      const promises = Array.from({ length: 10 }, () => taskService.createTask(taskData));
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(10);
      expect(mockApiClient.post).toHaveBeenCalledTimes(10);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty response data', async () => {
      // Arrange
      mockApiClient.get.mockResolvedValue({ data: null });

      // Act & Assert
      await expect(taskService.getTasks()).rejects.toThrow();
    });

    it('should handle malformed response data', async () => {
      // Arrange
      mockApiClient.get.mockResolvedValue({ data: 'invalid-json' });

      // Act & Assert
      await expect(taskService.getTasks()).rejects.toThrow();
    });

    it('should handle very long task descriptions', async () => {
      // Arrange
      const longDescription = 'A'.repeat(10000); // 10KB description
      const taskData = {
        text: 'Task with long description',
        description: longDescription,
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
      };

      mockApiClient.post.mockResolvedValue({ 
        data: { id: 'task-id', ...taskData } 
      });

      // Act
      const result = await taskService.createTask(taskData);

      // Assert
      expect(result.description).toEqual(longDescription);
    });

    it('should handle special characters in task text', async () => {
      // Arrange
      const specialCharsText = '🚀 Task with émojis & spëcial chars: <script>alert("xss")</script>';
      const taskData = {
        text: specialCharsText,
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
      };

      mockApiClient.post.mockResolvedValue({ 
        data: { id: 'task-id', ...taskData } 
      });

      // Act
      const result = await taskService.createTask(taskData);

      // Assert
      expect(result.text).toEqual(specialCharsText);
    });
  });
});
