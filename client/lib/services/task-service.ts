/**
 * Task Service - Handles all task-related API operations
 * Integrates with the backend TaskController and ProductivityService
 */

import { apiClient } from "@/lib/api-client";
import {
  TaskDTO,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskListResponse,
  TaskFilters,
  TaskSortOptions,
  UserCompanyRoleAssociation,
  TaskType,
  ProductivityItemStatus,
  MyVideoResumeRoles,
} from "@/types/task";
import { UserProfile } from "./user-service";

export class TaskService {
  private readonly baseUrl = "/api/task";

  /**
   * Get all tasks for the current user
   */
  async getTasks(
    filters?: TaskFilters,
    sort?: TaskSortOptions,
  ): Promise<TaskDTO[]> {
    try {
      const params = new URLSearchParams();

      if (filters) {
        if (filters.status?.length) {
          filters.status.forEach((status) =>
            params.append("status", status.toString()),
          );
        }
        if (filters.taskType?.length) {
          filters.taskType.forEach((type) =>
            params.append("taskType", type.toString()),
          );
        }
        if (filters.assignedToUserId) {
          params.append("assignedToUserId", filters.assignedToUserId);
        }
        if (filters.createdByUserId) {
          params.append("createdByUserId", filters.createdByUserId);
        }
        if (filters.startDate) {
          params.append("startDate", filters.startDate);
        }
        if (filters.endDate) {
          params.append("endDate", filters.endDate);
        }
      }

      if (sort) {
        params.append("sortField", sort.field);
        params.append("sortDirection", sort.direction);
      }

      const queryString = params.toString();
      const url = queryString ? `${this.baseUrl}?${queryString}` : this.baseUrl;

      const response = await apiClient.get<TaskDTO[]>(url);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      throw new Error("Failed to fetch tasks");
    }
  }

  /**
   * Get a specific task by ID
   */
  async getTaskById(taskId: string): Promise<TaskDTO> {
    try {
      const response = await apiClient.get<TaskDTO>(
        `${this.baseUrl}/${taskId}`,
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch task ${taskId}:`, error);
      throw new Error(`Failed to fetch task ${taskId}`);
    }
  }

  /**
   * Create a new task
   */
  async createTask(request: CreateTaskRequest): Promise<TaskDTO> {
    try {
      // Convert to backend DTO format
      const taskDto: Partial<TaskDTO> = {
        text: request.text,
        description: request.description,
        start: request.start,
        end: request.end,
        taskType: request.taskType,
        subTaskType: request.subTaskType,
        actionToTake: request.actionToTake,
        status: request.status || ProductivityItemStatus.ToDo,
        assignedToUserId: request.assignedToUserId,
      };

      const response = await apiClient.post<TaskDTO>(
        `${this.baseUrl}/save`,
        taskDto,
      );
      return response.data;
    } catch (error) {
      console.error("Failed to create task:", error);
      throw new Error("Failed to create task");
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(request: UpdateTaskRequest): Promise<TaskDTO> {
    try {
      // Convert to backend DTO format
      const taskDto: Partial<TaskDTO> = {
        id: request.id,
        text: request.text,
        description: request.description,
        start: request.start,
        end: request.end,
        taskType: request.taskType,
        subTaskType: request.subTaskType,
        actionToTake: request.actionToTake,
        status: request.status || ProductivityItemStatus.ToDo,
        assignedToUserId: request.assignedToUserId,
        updateDateTime: new Date().toISOString(),
      };

      const response = await apiClient.post<TaskDTO>(
        `${this.baseUrl}/save`,
        taskDto,
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to update task ${request.id}:`, error);
      throw new Error(`Failed to update task ${request.id}`);
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      await apiClient.delete(`${this.baseUrl}/${taskId}`);
    } catch (error) {
      console.error(`Failed to delete task ${taskId}:`, error);
      throw new Error(`Failed to delete task ${taskId}`);
    }
  }

  /**
   * Assign a task to a user
   */
  async assignTask(request: TaskAssignmentRequest): Promise<TaskDTO> {
    try {
      const task = await this.getTaskById(request.taskId);

      const updateRequest: UpdateTaskRequest = {
        id: task.id!,
        text: task.text,
        description: task.description,
        start: task.start,
        end: task.end,
        taskType: task.taskType,
        subTaskType: task.subTaskType,
        actionToTake: task.actionToTake,
        status: task.status,
        assignedToUserId: request.assignedToUserId,
      };

      return await this.updateTask(updateRequest);
    } catch (error) {
      console.error(`Failed to assign task ${request.taskId}:`, error);
      throw new Error(`Failed to assign task ${request.taskId}`);
    }
  }

  /**
   * Get users that can be assigned tasks (account members)
   */
  async getAssignableUsers(): Promise<UserCompanyRoleAssociation[]> {
    try {
      const response =
        await apiClient.get<UserCompanyRoleAssociation[]>("/api/account/users");
      return response.data;
    } catch (error) {
      console.error("Failed to fetch assignable users:", error);
      throw new Error("Failed to fetch assignable users");
    }
  }

  /**
   * Create role-specific onboarding tasks
   */
  async createOnboardingTasks(roles: MyVideoResumeRoles[]): Promise<TaskDTO[]> {
    try {
      const tasks: CreateTaskRequest[] = [];
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Common onboarding tasks
      tasks.push({
        text: "Complete your profile",
        description: "Add your personal information, skills, and preferences",
        start: now.toISOString(),
        end: tomorrow.toISOString(),
        taskType: TaskType.OnboardingProfile,
        status: ProductivityItemStatus.ToDo,
      });

      // Role-specific tasks
      if (roles.includes(MyVideoResumeRoles.JobSeeker)) {
        tasks.push(
          {
            text: "Polish your resume",
            description: "Upload or build your resume using our resume builder",
            start: now.toISOString(),
            end: tomorrow.toISOString(),
            taskType: TaskType.Resume,
            status: ProductivityItemStatus.ToDo,
          },
          {
            text: "Prepare for interviews",
            description: "Review common questions and prepare your stories",
            start: now.toISOString(),
            end: tomorrow.toISOString(),
            taskType: TaskType.Interview,
            status: ProductivityItemStatus.ToDo,
          },
        );
      }

      if (roles.includes(MyVideoResumeRoles.Recruiter)) {
        tasks.push(
          {
            text: "Set your recruiter preferences",
            description:
              "Define industries, roles, and locations you recruit for",
            start: now.toISOString(),
            end: tomorrow.toISOString(),
            taskType: TaskType.RecruiterPreferences,
            status: ProductivityItemStatus.ToDo,
          },
          {
            text: "Add your first candidate pipeline",
            description: "Create a Kanban board for an open role",
            start: now.toISOString(),
            end: tomorrow.toISOString(),
            taskType: TaskType.Recruiter,
            status: ProductivityItemStatus.ToDo,
          },
        );
      }

      if (
        roles.includes(MyVideoResumeRoles.Employer) ||
        roles.includes(MyVideoResumeRoles.EmployerManager)
      ) {
        tasks.push(
          {
            text: "Complete company profile",
            description: "Add company information, culture, and benefits",
            start: now.toISOString(),
            end: tomorrow.toISOString(),
            taskType: TaskType.Company,
            status: ProductivityItemStatus.ToDo,
          },
          {
            text: "Post your first job",
            description: "Create and publish your first job posting",
            start: now.toISOString(),
            end: tomorrow.toISOString(),
            taskType: TaskType.Job,
            status: ProductivityItemStatus.ToDo,
          },
        );
      }

      // Create all tasks
      const createdTasks: TaskDTO[] = [];
      for (const taskRequest of tasks) {
        const createdTask = await this.createTask(taskRequest);
        createdTasks.push(createdTask);
      }

      return createdTasks;
    } catch (error) {
      console.error("Failed to create onboarding tasks:", error);
      throw new Error("Failed to create onboarding tasks");
    }
  }

  /**
   * Get tasks assigned to the current user
   */
  async getMyTasks(): Promise<TaskDTO[]> {
    return this.getTasks();
  }

  /**
   * Get tasks created by the current user
   */
  async getCreatedTasks(): Promise<TaskDTO[]> {
    // The backend API filters by current user automatically
    return this.getTasks();
  }

  /**
   * Mark a task as completed
   */
  async completeTask(taskId: string): Promise<TaskDTO> {
    try {
      const task = await this.getTaskById(taskId);

      const updateRequest: UpdateTaskRequest = {
        id: task.id!,
        text: task.text,
        description: task.description,
        start: task.start,
        end: task.end,
        taskType: task.taskType,
        subTaskType: task.subTaskType,
        actionToTake: task.actionToTake,
        status: ProductivityItemStatus.Completed,
        assignedToUserId: task.assignedToUserId,
      };

      return await this.updateTask(updateRequest);
    } catch (error) {
      console.error(`Failed to complete task ${taskId}:`, error);
      throw new Error(`Failed to complete task ${taskId}`);
    }
  }
}

// Export singleton instance
export const taskService = new TaskService();
