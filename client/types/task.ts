/**
 * Task management types that match the backend API exactly
 * Based on MyVideoResume.Abstractions.Productivity namespace
 */

import { UserProfile } from "@/lib/services/user-service";
import { AccountUsageType } from "./account";

// Backend enums - must match exactly
export enum TaskType {
  General = 0,
  Project = 1,
  Email = 2,
  Phone = 3,
  Meeting = 4,
  Interview = 5,
  Onboarding = 10,
  OnboardingProfile = 11,
  OnboardingProfileSettings = 12,
  OnboardingPrivacy = 13,
  Recruiter = 20,
  RecruiterPreferences = 21,
  JobSeeker = 30,
  JobSeekerPreferences = 31,
  Company = 40,
  CompanySettings = 41,
  Profile = 50,
  Job = 60,
  Resume = 70,
}

export enum ProductivityItemStatus {
  Planning = 0,
  ToDo = 1,
  Open = 2,
  InProgress = 3,
  Closed = 4,
  Descoped = 5,
  Completed = 6,
  OnHold = 7,
  Cancelled = 8,
}

export enum Actions {
  ReadView = 0,
  UpdateEdit = 1,
  Create = 2,
  Delete = 3,
}

export enum MyVideoResumeRoles {
  Admin = 0,
  AccountOwner = 10,
  AccountAdmin = 11,
  Employer = 20,
  EmployerManager = 21,
  EmployerEmployee = 22,
  EmployerExecutive = 23,
  JobSeeker = 30,
  Recruiter = 40,
}

// Core task interfaces matching backend exactly
export interface TaskItem {
  createdByUserId?: string;
  assignedToUserId?: string;
  text: string;
  description?: string;
  start: string; // ISO date string
  end?: string; // ISO date string
  taskType: TaskType;
  subTaskType?: TaskType;
  actionToTake?: Actions;
  status: ProductivityItemStatus;
  creationDateTime?: string;
  updateDateTime?: string;
}

export interface TaskDTO extends TaskItem {
  id?: string;
  createdByUser?: UserProfile;
  assignedToUser?: UserProfile;
  boardId?: string;
}

// Request/Response types for API calls
export interface CreateTaskRequest {
  text: string;
  description?: string;
  start: string;
  end?: string;
  taskType: TaskType;
  subTaskType?: TaskType;
  actionToTake?: Actions;
  status?: ProductivityItemStatus;
  assignedToUserId?: string;
}

export interface UpdateTaskRequest extends CreateTaskRequest {
  id: string;
}

export interface TaskAssignmentRequest {
  taskId: string;
  assignedToUserId: string;
  assignedByUserId: string;
}

export interface TaskListResponse {
  tasks: TaskDTO[];
  totalCount: number;
}

// User company association for task assignment
export interface UserCompanyRoleAssociation {
  id: string;
  userId: string;
  inviteStatus: InviteStatus;
  inviteStatusStartDateTime?: string;
  inviteStatusEndDateTime?: string;
  userProfile: UserProfile;
  rolesAssigned: MyVideoResumeRoles[];
  termsOfUseAgreementAcceptedDateTime?: string;
  termsOfUserAgreementVersion?: string;
  isPaidAccount: boolean;
  isPaidAccountDateTime?: string;
  paidPurchasePrice?: number;
  paidPurchaseDateTime?: string;
  accountUsageType?: AccountUsageType;
}

export enum InviteStatus {
  Invited = 0,
  Accepted = 1,
  Rejected = 2,
  Resent = 3,
  Expired = 4,
  Owner = 5,
}



// Frontend-specific types for UI components
export interface TaskUIState {
  id: string;
  title: string;
  description?: string;
  type: "onboarding" | "interview" | "recruiting" | "sales" | "general";
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "completed";
  startDate?: string;
  dueDate: string;
  createdAt: string;
  updatedAt?: string;
  assignedTo?: UserProfile;
  createdBy?: UserProfile;
}

// Utility functions for type conversion
export const mapBackendTaskTypeToUI = (
  taskType: TaskType,
): TaskUIState["type"] => {
  switch (taskType) {
    case TaskType.Onboarding:
    case TaskType.OnboardingProfile:
    case TaskType.OnboardingProfileSettings:
    case TaskType.OnboardingPrivacy:
      return "onboarding";
    case TaskType.Interview:
      return "interview";
    case TaskType.Recruiter:
    case TaskType.Company:
      return "recruiting";
    case TaskType.General:
    default:
      return "general";
  }
};

export const mapUITaskTypeToBackend = (type: TaskUIState["type"]): TaskType => {
  switch (type) {
    case "onboarding":
      return TaskType.Onboarding;
    case "interview":
      return TaskType.Interview;
    case "recruiting":
      return TaskType.Recruiter;
    case "sales":
      return TaskType.Company;
    case "general":
    default:
      return TaskType.General;
  }
};

export const mapBackendStatusToUI = (
  status: ProductivityItemStatus,
): TaskUIState["status"] => {
  switch (status) {
    case ProductivityItemStatus.ToDo:
    case ProductivityItemStatus.Open:
    case ProductivityItemStatus.Planning:
      return "todo";
    case ProductivityItemStatus.InProgress:
      return "in_progress";
    case ProductivityItemStatus.Completed:
    case ProductivityItemStatus.Closed:
      return "completed";
    default:
      return "todo";
  }
};

export const mapUIStatusToBackend = (
  status: TaskUIState["status"],
): ProductivityItemStatus => {
  switch (status) {
    case "todo":
      return ProductivityItemStatus.ToDo;
    case "in_progress":
      return ProductivityItemStatus.InProgress;
    case "completed":
      return ProductivityItemStatus.Completed;
    default:
      return ProductivityItemStatus.ToDo;
  }
};

// Task filtering and sorting options
export interface TaskFilters {
  status?: ProductivityItemStatus[];
  taskType?: TaskType[];
  assignedToUserId?: string;
  createdByUserId?: string;
  startDate?: string;
  endDate?: string;
}

export interface TaskSortOptions {
  field: "start" | "end" | "creationDateTime" | "updateDateTime" | "text";
  direction: "asc" | "desc";
}
