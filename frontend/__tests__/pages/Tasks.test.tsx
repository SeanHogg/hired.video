/**
 * Integration tests for Tasks page
 * Tests authentication, task loading, UI interactions, and error handling
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderWithProviders, mockAuthValue } from '../test-render';
import Tasks from '../../pages/Tasks';
import { useAuth } from '../../lib/auth';
import { taskService } from '../../lib/services/task-service';
import { TaskDTO, ProductivityItemStatus, TaskType } from '../../types/task';

// Mock dependencies
vi.mock('../../lib/auth');
vi.mock('../../lib/services/task-service');
vi.mock('../../hooks/use-sidebar', () => ({
  useSidebar: () => ({
    sidebarOpen: false,
    sidebarCollapsed: false,
    openSidebar: vi.fn(),
    closeSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
  }),
}));

// Mock components that aren't essential for testing
vi.mock('../../components/Navigation', () => ({
  default: () => <div data-testid="navigation">Navigation</div>,
}));

vi.mock('../../components/Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock('../../components/Footer', () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));

describe('Tasks Page', () => {
  let mockUseAuth: Mock;
  let mockTaskService: {
    getTasks: Mock;
    getAssignableUsers: Mock;
    createTask: Mock;
    updateTask: Mock;
    deleteTask: Mock;
  };

  const mockUser = {
    id: 'user123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'job_seeker',
  };

  const mockTasks: TaskDTO[] = [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      text: 'Complete resume',
      description: 'Update resume with latest experience',
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-02T00:00:00Z',
      taskType: TaskType.General,
      status: ProductivityItemStatus.ToDo,
      creationDateTime: '2024-01-01T00:00:00Z',
    },
    {
      id: '123e4567-e89b-12d3-a456-426614174001',
      text: 'Apply to jobs',
      description: 'Submit applications to target companies',
      start: '2024-01-01T00:00:00Z',
      taskType: TaskType.General,
      status: ProductivityItemStatus.InProgress,
      creationDateTime: '2024-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    mockUseAuth = useAuth as Mock;
    mockTaskService = taskService as any;

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock implementations
    mockUseAuth.mockReturnValue(mockAuthValue(true, { user: mockUser }));

    mockTaskService.getTasks.mockResolvedValue(mockTasks);
    mockTaskService.getAssignableUsers.mockResolvedValue([]);
  });

  const renderTasksPage = () => {
    return renderWithProviders(<Tasks />);
  };

  describe('Authentication and Loading', () => {
    it('should load tasks when user is authenticated', async () => {
      // Act
      renderTasksPage();

      // Assert
      await waitFor(() => {
        expect(mockTaskService.getTasks).toHaveBeenCalled();
      });

      // Should display tasks
      await waitFor(() => {
        expect(screen.getByText('Complete resume')).toBeInTheDocument();
        expect(screen.getByText('Apply to jobs')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      // Arrange
      mockTaskService.getTasks.mockImplementation(() => new Promise(() => {})); // Never resolves

      // Act
      renderTasksPage();

      // Assert
      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('should handle task loading errors gracefully', async () => {
      // Arrange
      const errorMessage = 'Failed to load tasks';
      mockTaskService.getTasks.mockRejectedValue(new Error(errorMessage));

      // Act
      renderTasksPage();

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/failed to load tasks/i)).toBeInTheDocument();
      });
    });
  });

  describe('Task Display and Filtering', () => {
    it('should display tasks in different status columns', async () => {
      // Act
      renderTasksPage();

      // Assert — Kanban columns render. Query by testid: the status label
      // ("To Do" etc.) also appears as a per-card status badge, so a bare
      // getByText is ambiguous once the page renders fully.
      await waitFor(() => {
        expect(screen.getByTestId('todo-column')).toBeInTheDocument();
        expect(screen.getByTestId('inprogress-column')).toBeInTheDocument();
        expect(screen.getByTestId('completed-column')).toBeInTheDocument();
      });

      // Check tasks are in correct columns
      await waitFor(() => {
        expect(
          within(screen.getByTestId('todo-column')).getByText('Complete resume'),
        ).toBeInTheDocument();
        expect(
          within(screen.getByTestId('inprogress-column')).getByText('Apply to jobs'),
        ).toBeInTheDocument();
      });
    });

    it('should allow switching between different views', async () => {
      // Act
      renderTasksPage();

      // Assert - the view-axis segmented control renders icon-only links
      // whose accessible name comes from the aria-label.
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Kanban' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Calendar' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'List' })).toBeInTheDocument();
      });

      // Test view switching
      fireEvent.click(screen.getByRole('link', { name: 'Calendar' }));
      await waitFor(() => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('link', { name: 'List' }));
      await waitFor(() => {
        expect(screen.getByTestId('list-view')).toBeInTheDocument();
      });
    });
  });

  describe('Task Creation', () => {
    it('should open task creation modal when add button is clicked', async () => {
      // Act
      renderTasksPage();

      await waitFor(() => {
        expect(screen.getByText('Complete resume')).toBeInTheDocument();
      });

      // Click add task button
      const addButton = screen.getByRole('button', { name: /add task/i });
      fireEvent.click(addButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Create New Task')).toBeInTheDocument();
        expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      });
    });

    it('should create a new task successfully', async () => {
      // Arrange
      const newTask: TaskDTO = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        text: 'New Task',
        description: 'New task description',
        start: '2024-01-03T00:00:00Z',
        taskType: TaskType.General,
        status: ProductivityItemStatus.ToDo,
        creationDateTime: '2024-01-03T00:00:00Z',
      };

      mockTaskService.createTask.mockResolvedValue(newTask);

      // Act
      renderTasksPage();

      await waitFor(() => {
        expect(screen.getByText('Complete resume')).toBeInTheDocument();
      });

      // Open creation modal
      const addButton = screen.getByRole('button', { name: /add task/i });
      fireEvent.click(addButton);

      // Fill form
      await waitFor(() => {
        const titleInput = screen.getByLabelText(/task title/i);
        const descriptionInput = screen.getByLabelText(/description/i);
        
        fireEvent.change(titleInput, { target: { value: 'New Task' } });
        fireEvent.change(descriptionInput, { target: { value: 'New task description' } });
      });

      // Submit form
      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);

      // Assert
      await waitFor(() => {
        expect(mockTaskService.createTask).toHaveBeenCalledWith(
          expect.objectContaining({
            text: 'New Task',
            description: 'New task description',
          })
        );
      });
    });
  });

  describe('Task Interactions', () => {
    it('should allow editing a task', async () => {
      // Act
      renderTasksPage();

      await waitFor(() => {
        expect(screen.getByText('Complete resume')).toBeInTheDocument();
      });

      // Click on a task to open details
      fireEvent.click(screen.getByText('Complete resume'));

      // Assert task panel opens
      await waitFor(() => {
        expect(screen.getByText('Task Details')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Complete resume')).toBeInTheDocument();
      });

      // Click edit button
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);

      // Assert edit mode is enabled
      await waitFor(() => {
        const titleInput = screen.getByDisplayValue('Complete resume');
        expect(titleInput).not.toBeDisabled();
      });
    });

    it('should allow deleting a task', async () => {
      // Arrange
      mockTaskService.deleteTask.mockResolvedValue(undefined);

      // Act
      renderTasksPage();

      await waitFor(() => {
        expect(screen.getByText('Complete resume')).toBeInTheDocument();
      });

      // Click on a task to open details
      fireEvent.click(screen.getByText('Complete resume'));

      await waitFor(() => {
        expect(screen.getByText('Task Details')).toBeInTheDocument();
      });

      // Click delete button
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Assert
      await waitFor(() => {
        expect(mockTaskService.deleteTask).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle task creation errors', async () => {
      // Arrange
      mockTaskService.createTask.mockRejectedValue(new Error('Creation failed'));

      // Act
      renderTasksPage();

      await waitFor(() => {
        expect(screen.getByText('Complete resume')).toBeInTheDocument();
      });

      // Try to create a task
      const addButton = screen.getByRole('button', { name: /add task/i });
      fireEvent.click(addButton);

      await waitFor(() => {
        const titleInput = screen.getByLabelText(/task title/i);
        fireEvent.change(titleInput, { target: { value: 'New Task' } });
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);

      // Assert error is displayed
      await waitFor(() => {
        expect(screen.getByText(/creation failed/i)).toBeInTheDocument();
      });
    });

    it('should handle task deletion errors', async () => {
      // Arrange
      mockTaskService.deleteTask.mockRejectedValue(new Error('Deletion failed'));

      // Act
      renderTasksPage();

      await waitFor(() => {
        expect(screen.getByText('Complete resume')).toBeInTheDocument();
      });

      // Try to delete a task
      fireEvent.click(screen.getByText('Complete resume'));

      await waitFor(() => {
        expect(screen.getByText('Task Details')).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Assert error is displayed
      await waitFor(() => {
        expect(screen.getByText(/deletion failed/i)).toBeInTheDocument();
      });
    });
  });
});
