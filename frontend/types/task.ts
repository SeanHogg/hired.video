/**
 * Task management types that match the backend API exactly
 * Based on hired.video.Abstractions.Productivity namespace
 */

import i18next from "i18next";
import { UserProfile } from "@/lib/services/user-service";

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
  url?: string;
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
  /** Free-form back-reference + verification hints stored on the task
   *  row's jsonb metadata column. The Career 360 "Add to Tasks" flow
   *  uses this to keep `{ source: "career360", gapId, roadmapStepId,
   *  targetTitle, validation: { type: "cert", patterns: [...] } }` so
   *  Tasks can later auto-validate completion against the master resume
   *  without having to re-derive the link. */
  metadata?: Record<string, unknown>;
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
  url?: string;
}

// Canonical TaskDTO → TaskUIState mapper. Single source of truth shared by the
// Tasks page load and the Content Creator → Gigs board so the two never drift
// (legacy taskType/status live in the DTO; dates are coerced to local `ymd`).
export const taskDtoToUIState = (dto: TaskDTO): TaskUIState => {
  const toYmd = (iso?: string): string | undefined => {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return {
    id: dto.id || "",
    title: dto.text || "",
    description: dto.description,
    type: mapBackendTaskTypeToUI(dto.taskType),
    priority: "medium",
    status: mapBackendStatusToUI(dto.status),
    startDate: toYmd(dto.start),
    dueDate: toYmd(dto.end) ?? toYmd(dto.start) ?? new Date().toISOString().slice(0, 10),
    createdAt: dto.creationDateTime || new Date().toISOString(),
    updatedAt: dto.updateDateTime,
    assignedTo: dto.assignedToUser,
    createdBy: dto.createdByUser,
    url: dto.url,
  };
};

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

// Display-name registries — one entry per enum member (open/closed: a new
// member is one row here + its locale key). English values are the fallback
// when i18n hasn't loaded the key.
const TASK_TYPE_LABELS: Record<TaskType, string> = {
  [TaskType.General]: "General",
  [TaskType.Project]: "Project",
  [TaskType.Email]: "Email",
  [TaskType.Phone]: "Phone",
  [TaskType.Meeting]: "Meeting",
  [TaskType.Interview]: "Interview",
  [TaskType.Recruiting]: "Recruiting",
  [TaskType.Sales]: "Sales",
  [TaskType.Onboarding]: "Onboarding",
  [TaskType.OnboardingProfile]: "Profile Setup",
  [TaskType.OnboardingProfileSettings]: "Profile Settings",
  [TaskType.OnboardingPrivacy]: "Privacy Settings",
  [TaskType.OnboardingCreateTask]: "Create First Task",
  [TaskType.OnboardingCreateResume]: "Create Resume",
  [TaskType.OnboardingPostJob]: "Post Job",
  [TaskType.OnboardingFollowCandidate]: "Follow Candidate",
  [TaskType.OnboardingFollowResume]: "Follow Resume",
  [TaskType.OnboardingReferUser]: "Refer User",
  [TaskType.Recruiter]: "Recruiter Tasks",
  [TaskType.RecruiterPreferences]: "Recruiter Preferences",
  [TaskType.JobSeeker]: "Job Seeker Tasks",
  [TaskType.JobSeekerPreferences]: "Job Seeker Preferences",
  [TaskType.Company]: "Company",
  [TaskType.CompanySettings]: "Company Settings",
  [TaskType.Profile]: "Profile",
  [TaskType.Job]: "Job",
  [TaskType.Resume]: "Resume",
};

const TASK_STATUS_LABELS: Record<ProductivityItemStatus, string> = {
  [ProductivityItemStatus.Planning]: "Planning",
  [ProductivityItemStatus.ToDo]: "To Do",
  [ProductivityItemStatus.Open]: "Open",
  [ProductivityItemStatus.InProgress]: "In Progress",
  [ProductivityItemStatus.Closed]: "Closed",
  [ProductivityItemStatus.Descoped]: "Descoped",
  [ProductivityItemStatus.Completed]: "Completed",
  [ProductivityItemStatus.OnHold]: "On Hold",
  [ProductivityItemStatus.Cancelled]: "Cancelled",
};

function translatedLabel(key: string, fallback: string): string {
  return i18next.t(key, { defaultValue: fallback }) || fallback;
}

// Get display name for task type
export const getTaskTypeDisplayName = (taskType: TaskType): string => {
  const fallback = TASK_TYPE_LABELS[taskType];
  if (fallback === undefined) return translatedLabel("tasks.label.unknown", "Unknown");
  return translatedLabel(`tasks.type.${TaskType[taskType]}`, fallback);
};

// Get status display name
export const getStatusDisplayName = (status: ProductivityItemStatus): string => {
  const fallback = TASK_STATUS_LABELS[status];
  if (fallback === undefined) return translatedLabel("tasks.label.unknown", "Unknown");
  return translatedLabel(`tasks.status.${ProductivityItemStatus[status]}`, fallback);
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
