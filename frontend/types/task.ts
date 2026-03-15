/**
 * Task management types that match the backend API exactly
 * Based on hired.video.Abstractions.Productivity namespace
 */

import { UserProfile } from "@/lib/services/user-service";
import { AccountUsageType } from "./account";

// Backend enums - must match exactly
export enum TaskType {
  General = 0, // All Roles
  Project = 1, // All Roles
  Email = 2, // All Roles
  Phone = 3, // All Roles
  Meeting = 4, // All Roles
  Interview = 5, // All Roles
  Recruiting = 6, // All Roles
  Sales = 7, // All Roles
  Onboarding = 10, // All Roles
  OnboardingProfile = 11, // All Roles but created by the System
  OnboardingProfileSettings = 12, // All Roles but created by the System
  OnboardingPrivacy = 13, // All Roles but created by the System
  OnboardingCreateTask = 14, // All Roles but created by the System - Universal onboarding task
  OnboardingCreateResume = 15, // JobSeeker onboarding task
  OnboardingPostJob = 16, // Company/Employer onboarding task
  OnboardingFollowCandidate = 17, // Recruiter onboarding task
  OnboardingFollowResume = 18, // Recruiter onboarding task
  OnboardingReferUser = 19, // Affiliate onboarding task
  Recruiter = 20, // Recruiter but created by the System
  RecruiterPreferences = 21, // Recruiter but created by System
  JobSeeker = 30, // Job Seeker but created by System
  JobSeekerPreferences = 31, // Job Seeker but created by System
  Company = 40, // Employer
  CompanySettings = 41, // Employer
  Profile = 50, // All Roles
  Job = 60, // All Roles
  Resume = 70, // All Roles
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

export enum hiredvideoRoles {
  Admin = 0,
  AccountOwner = 10,
  AccountAdmin = 11,
  Employer = 20,
  EmployerManager = 21,
  EmployerEmployee = 22,
  EmployerExecutive = 23,
  JobSeeker = 30,
  Recruiter = 40,
  Affiliate = 50,
}

// Core task interfaces matching backend exactly
export interface TaskItem {
  createdByUserId?: string;
  assignedToUserId?: string; // Frontend sends as string, backend expects Guid?
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
  rolesAssigned: hiredvideoRoles[];
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
  type: TaskType;
  priority: "low" | "medium" | "high";
  status: ProductivityItemStatus;
  startDate?: string;
  dueDate: string;
  createdAt: string;
  updatedAt?: string;
  assignedTo?: UserProfile;
  createdBy?: UserProfile;
}

// Utility functions for type conversion
export const mapBackendTaskTypeToUI = (taskType: TaskType): TaskType => {
  return taskType; // Direct mapping since we're using the same enum
};

export const mapUITaskTypeToBackend = (type: TaskType): TaskType => {
  return type; // Direct mapping since we're using the same enum
};

export const mapBackendStatusToUI = (
  status: ProductivityItemStatus,
): ProductivityItemStatus => {
  return status; // Direct mapping since we're using the same enum
};

export const mapUIStatusToBackend = (
  status: ProductivityItemStatus,
): ProductivityItemStatus => {
  return status; // Direct mapping since we're using the same enum
};

// Role-based task type filtering
export const getAvailableTaskTypesForRole = (userRole: string): TaskType[] => {
  const allRoles: TaskType[] = [
    TaskType.General,
    TaskType.Project,
    TaskType.Email,
    TaskType.Phone,
    TaskType.Meeting,
    TaskType.Interview,
    TaskType.Recruiting,
    TaskType.Sales,
    TaskType.Onboarding,
    TaskType.Profile,
    TaskType.Job,
    TaskType.Resume,
  ];

  const recruiterOnly: TaskType[] = [];
  const employerOnly: TaskType[] = [TaskType.Company, TaskType.CompanySettings];
  const jobSeekerOnly: TaskType[] = [];

  // System-created task types (not available for manual creation)
  const systemCreated: TaskType[] = [
    TaskType.OnboardingProfile,
    TaskType.OnboardingProfileSettings,
    TaskType.OnboardingPrivacy,
    TaskType.Recruiter,
    TaskType.RecruiterPreferences,
    TaskType.JobSeeker,
    TaskType.JobSeekerPreferences,
  ];

  let availableTypes = [...allRoles];

  switch (userRole?.toLowerCase()) {
    case "recruiter":
      availableTypes = [...availableTypes, ...recruiterOnly];
      break;
    case "employer":
    case "employermanager":
    case "employeremployee":
    case "employerexecutive":
      availableTypes = [...availableTypes, ...employerOnly];
      break;
    case "jobseeker":
      availableTypes = [...availableTypes, ...jobSeekerOnly];
      break;
    default:
      // Default to all roles
      break;
  }

  // Remove system-created types
  return availableTypes.filter(type => !systemCreated.includes(type));
};

// Get display name for task type
export const getTaskTypeDisplayName = (taskType: TaskType): string => {
  switch (taskType) {
    case TaskType.General:
      return "General";
    case TaskType.Project:
      return "Project";
    case TaskType.Email:
      return "Email";
    case TaskType.Phone:
      return "Phone";
    case TaskType.Meeting:
      return "Meeting";
    case TaskType.Interview:
      return "Interview";
    case TaskType.Recruiting:
      return "Recruiting";
    case TaskType.Sales:
      return "Sales";
    case TaskType.Onboarding:
      return "Onboarding";
    case TaskType.OnboardingProfile:
      return "Profile Setup";
    case TaskType.OnboardingProfileSettings:
      return "Profile Settings";
    case TaskType.OnboardingPrivacy:
      return "Privacy Settings";
    case TaskType.OnboardingCreateTask:
      return "Create First Task";
    case TaskType.OnboardingCreateResume:
      return "Create Resume";
    case TaskType.OnboardingPostJob:
      return "Post Job";
    case TaskType.OnboardingFollowCandidate:
      return "Follow Candidate";
    case TaskType.OnboardingFollowResume:
      return "Follow Resume";
    case TaskType.OnboardingReferUser:
      return "Refer User";
    case TaskType.Recruiter:
      return "Recruiter Tasks";
    case TaskType.RecruiterPreferences:
      return "Recruiter Preferences";
    case TaskType.JobSeeker:
      return "Job Seeker Tasks";
    case TaskType.JobSeekerPreferences:
      return "Job Seeker Preferences";
    case TaskType.Company:
      return "Company";
    case TaskType.CompanySettings:
      return "Company Settings";
    case TaskType.Profile:
      return "Profile";
    case TaskType.Job:
      return "Job";
    case TaskType.Resume:
      return "Resume";
    default:
      return "Unknown";
  }
};

// Get status display name
export const getStatusDisplayName = (status: ProductivityItemStatus): string => {
  switch (status) {
    case ProductivityItemStatus.Planning:
      return "Planning";
    case ProductivityItemStatus.ToDo:
      return "To Do";
    case ProductivityItemStatus.Open:
      return "Open";
    case ProductivityItemStatus.InProgress:
      return "In Progress";
    case ProductivityItemStatus.Closed:
      return "Closed";
    case ProductivityItemStatus.Descoped:
      return "Descoped";
    case ProductivityItemStatus.Completed:
      return "Completed";
    case ProductivityItemStatus.OnHold:
      return "On Hold";
    case ProductivityItemStatus.Cancelled:
      return "Cancelled";
    default:
      return "Unknown";
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
