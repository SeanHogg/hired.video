/**
 * Unit tests for TaskService
 * Tests API interactions, error handling, and data transformations
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { TaskService } from '../task-service';
import { apiClient } from '../../api-client';
import { TaskDTO, ProductivityItemStatus, TaskType } from '../../../types/task';

// Mock the API client
vi.mock('../../api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('TaskService', () => {
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

  describe('getTasks', () => {
    it('should fetch tasks successfully', async () => {
      // Arrange
      const mockTasks: TaskDTO[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          text: 'Test Task',
          description: 'Test Description',
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-02T00:00:00Z',
          taskType: TaskType.General,
          status: ProductivityItemStatus.ToDo,
          creationDateTime: '2024-01-01T00:00:00Z',
        },
      ];

      mockApiClient.get.mockResolvedValue({ data: mockTasks });

      // Act
      const result = await taskService.getTasks();

      // Assert
      expect(result).toEqual(mockTasks);
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      mockApiClient.get.mockRejectedValue(new Error('API Error'));

      // Act & Assert
      await expect(taskService.getTasks()).rejects.toThrow('Failed to fetch tasks');
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/task');
    });

    it('should include query parameters when filters are provided', async () => {
      // Arrange
      const filters = {
        status: [ProductivityItemStatus.InProgress],
        taskType: [TaskType.General],
        assignedToUserId: 'user123',
      };

      mockApiClient.get.mockResolvedValue({ data: [] });

      // Act
      await taskService.getTasks(filters);

      // Assert
      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/task?status=3&taskType=0&assignedToUserId=user123'
      );
    });
  });

  describe('createTask', () => {
    it('should create a task successfully', async () => {
      // Arrange
      const request = {
        text: 'New Task',
        description: 'New Description',
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
        status: ProductivityItemStatus.ToDo,
      };

      const mockResponse: TaskDTO = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        ...request,
        creationDateTime: '2024-01-01T00:00:00Z',
      };

      mockApiClient.post.mockResolvedValue({ data: mockResponse });

      // Act
      const result = await taskService.createTask(request);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/task/save', expect.objectContaining({
        text: request.text,
        description: request.description,
        start: request.start,
        taskType: request.taskType,
        status: request.status,
      }));
    });

    it('should handle creation errors', async () => {
      // Arrange
      const request = {
        text: 'New Task',
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
      };

      mockApiClient.post.mockRejectedValue(new Error('Creation failed'));

      // Act & Assert
      await expect(taskService.createTask(request)).rejects.toThrow('Failed to create task');
    });
  });

  describe('updateTask', () => {
    it('should update a task successfully', async () => {
      // Arrange
      const request = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Updated Task',
        description: 'Updated Description',
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
        status: ProductivityItemStatus.InProgress,
      };

      const mockResponse: TaskDTO = {
        ...request,
        updateDateTime: '2024-01-01T12:00:00Z',
      };

      mockApiClient.post.mockResolvedValue({ data: mockResponse });

      // Act
      const result = await taskService.updateTask(request);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/task/save', expect.objectContaining({
        id: request.id,
        text: request.text,
        description: request.description,
        start: request.start,
        taskType: request.taskType,
        status: request.status,
        updateDateTime: expect.any(String),
      }));
    });
  });

  describe('deleteTask', () => {
    it('should delete a task successfully', async () => {
      // Arrange
      const taskId = '123e4567-e89b-12d3-a456-426614174000';
      mockApiClient.delete.mockResolvedValue({});

      // Act
      await taskService.deleteTask(taskId);

      // Assert
      expect(mockApiClient.delete).toHaveBeenCalledWith(`/api/task/${taskId}`);
    });

    it('should handle deletion errors', async () => {
      // Arrange
      const taskId = '123e4567-e89b-12d3-a456-426614174000';
      mockApiClient.delete.mockRejectedValue(new Error('Deletion failed'));

      // Act & Assert
      await expect(taskService.deleteTask(taskId)).rejects.toThrow('Failed to delete task 123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('getTaskById', () => {
    it('should fetch a specific task successfully', async () => {
      // Arrange
      const taskId = '123e4567-e89b-12d3-a456-426614174000';
      const mockTask: TaskDTO = {
        id: taskId,
        text: 'Specific Task',
        start: '2024-01-01T00:00:00Z',
        taskType: TaskType.General,
        status: ProductivityItemStatus.ToDo,
      };

      mockApiClient.get.mockResolvedValue({ data: mockTask });

      // Act
      const result = await taskService.getTaskById(taskId);

      // Assert
      expect(result).toEqual(mockTask);
      expect(mockApiClient.get).toHaveBeenCalledWith(`/api/task/${taskId}`);
    });
  });

  describe('getAssignableUsers', () => {
    it('should fetch assignable users successfully', async () => {
      // Arrange
      const mockUsers = [
        { id: 'user1', name: 'User 1' },
        { id: 'user2', name: 'User 2' },
      ];

      mockApiClient.get.mockResolvedValue({ data: mockUsers });

      // Act
      const result = await taskService.getAssignableUsers();

      // Assert
      expect(result).toEqual(mockUsers);
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/account/users');
    });

    it('should handle errors when fetching assignable users', async () => {
      // Arrange
      mockApiClient.get.mockRejectedValue(new Error('Users fetch failed'));

      // Act & Assert
      await expect(taskService.getAssignableUsers()).rejects.toThrow('Failed to fetch assignable users');
    });
  });
});
