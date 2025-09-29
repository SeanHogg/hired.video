/**
 * Dynamic Action Generator
 *
 * Generates context-aware actions for cards based on user permissions,
 * item ownership, and business rules.
 */

import {
  Eye,
  Edit,
  Trash2,
  Settings,
  UserPlus,
  FileText,
  MessageCircle,
  Bookmark,
  BookmarkX,
  Share2,
  Download,
  Copy,
  Play,
  Pause,
  BarChart3,
  Users,
  Building2,
  Calendar,
} from "lucide-react";

import type {
  UserContext,
  ItemOwnership,
  NormalizedCardData,
  CardInteractions,
} from "@/types/normalized-cards";

import { canPerformAction } from "@/lib/user-context";

// Enhanced CardAction interface with more properties
export interface DynamicCardAction {
  id: string;
  label: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  icon?: React.ComponentType<{ className?: string }>;
   
  onClick: (event: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
  requiresConfirmation?: boolean;
  priority?: number; // For action ordering
}

/**
 * Generate dynamic actions for job cards
 */
export function generateJobActions(
  job: NormalizedCardData,
  userContext: UserContext,
  itemOwnership: ItemOwnership,
  interactions: CardInteractions,
): DynamicCardAction[] {
  const actions: DynamicCardAction[] = [];

  // View action - always available
  actions.push({
    id: "view",
    label: "View",
    variant: "outline",
    icon: Eye,
    onClick: () => interactions.onView?.(job),
    priority: 1,
  });

  // Owner actions
  if (canPerformAction("edit", itemOwnership, userContext)) {
    actions.push({
      id: "edit",
      label: "Edit",
      icon: Edit,
      onClick: () => interactions.onEdit?.(job.id),
      priority: 2,
    });

    actions.push({
      id: "analytics",
      label: "Analytics",
      icon: BarChart3,
      onClick: () => handleJobAnalytics(job.id),
      priority: 5,
    });

    // Job-specific owner actions
    if (job.status === "active") {
      actions.push({
        id: "pause",
        label: "Pause",
        icon: Pause,
        onClick: () => handleJobStatusChange(job.id, "paused"),
        priority: 3,
      });
    } else if (job.status === "paused") {
      actions.push({
        id: "activate",
        label: "Activate",
        icon: Play,
        onClick: () => handleJobStatusChange(job.id, "active"),
        priority: 3,
      });
    }

    actions.push({
      id: "clone",
      label: "Clone",
      icon: Copy,
      onClick: () => handleJobClone(job.id),
      priority: 4,
    });
  }

  // Account owner actions
  if (canPerformAction("assign", itemOwnership, userContext)) {
    actions.push({
      id: "assign",
      label: "Assign Recruiter",
      icon: UserPlus,
      onClick: () => interactions.onAssign?.(job.id),
      priority: 3,
    });

    actions.push({
      id: "manage",
      label: "Manage",
      icon: Settings,
      onClick: () => interactions.onManage?.(job.id),
      priority: 4,
    });
  }

  // Recruiter actions
  if (canPerformAction("review", itemOwnership, userContext)) {
    actions.push({
      id: "review",
      label: "Review Applications",
      icon: FileText,
      onClick: () => interactions.onReview?.(job.id),
      priority: 2,
    });

    actions.push({
      id: "contact",
      label: "Contact Candidates",
      icon: MessageCircle,
      onClick: () => interactions.onContact?.(job.id),
      priority: 3,
    });
  }

  // Tracking actions
  if (canPerformAction("track", itemOwnership, userContext)) {
    actions.push({
      id: "track",
      label: "Track",
      icon: Bookmark,
      onClick: () => interactions.onTrack?.(job.id),
      priority: 6,
    });
  } else if (canPerformAction("untrack", itemOwnership, userContext)) {
    actions.push({
      id: "untrack",
      label: "Untrack",
      icon: BookmarkX,
      onClick: () => interactions.onUntrack?.(job.id),
      priority: 6,
    });
  }

  // Delete action - always last
  if (canPerformAction("delete", itemOwnership, userContext)) {
    actions.push({
      id: "delete",
      label: "Delete",
      variant: "destructive",
      icon: Trash2,
      onClick: () => interactions.onDelete?.(job.id),
      requiresConfirmation: true,
      priority: 10,
    });
  }

  return actions.sort((a, b) => (a.priority || 0) - (b.priority || 0));
}

/**
 * Generate dynamic actions for company cards
 */
export function generateCompanyActions(
  company: NormalizedCardData,
  userContext: UserContext,
  itemOwnership: ItemOwnership,
  interactions: CardInteractions,
): DynamicCardAction[] {
  const actions: DynamicCardAction[] = [];

  // View action - always available
  actions.push({
    id: "view",
    label: "View",
    variant: "outline",
    icon: Eye,
    onClick: () => interactions.onView?.(company),
    priority: 1,
  });

  // Owner actions
  if (canPerformAction("edit", itemOwnership, userContext)) {
    actions.push({
      id: "edit",
      label: "Edit Profile",
      icon: Edit,
      onClick: () => interactions.onEdit?.(company.id),
      priority: 2,
    });

    actions.push({
      id: "team",
      label: "Manage Team",
      icon: Users,
      onClick: () => handleTeamManagement(company.id),
      priority: 3,
    });

    actions.push({
      id: "jobs",
      label: "Post Job",
      icon: FileText,
      onClick: () => handleJobPosting(company.id),
      priority: 4,
    });
  }

  // Contact actions for recruiters
  if (canPerformAction("contact", itemOwnership, userContext)) {
    actions.push({
      id: "contact",
      label: "Contact",
      icon: MessageCircle,
      onClick: () => interactions.onContact?.(company.id),
      priority: 3,
    });
  }

  // Tracking actions
  if (canPerformAction("track", itemOwnership, userContext)) {
    actions.push({
      id: "follow",
      label: "Follow",
      icon: Bookmark,
      onClick: () => interactions.onTrack?.(company.id),
      priority: 5,
    });
  } else if (canPerformAction("untrack", itemOwnership, userContext)) {
    actions.push({
      id: "unfollow",
      label: "Unfollow",
      icon: BookmarkX,
      onClick: () => interactions.onUntrack?.(company.id),
      priority: 5,
    });
  }

  return actions.sort((a, b) => (a.priority || 0) - (b.priority || 0));
}

/**
 * Generate dynamic actions for resume cards
 */
export function generateResumeActions(
  resume: NormalizedCardData,
  userContext: UserContext,
  itemOwnership: ItemOwnership,
  interactions: CardInteractions,
): DynamicCardAction[] {
  const actions: DynamicCardAction[] = [];

  // View action - always available for public resumes
  actions.push({
    id: "view",
    label: "View",
    variant: "outline",
    icon: Eye,
    onClick: () => interactions.onView?.(resume),
    priority: 1,
  });

  // Owner actions
  if (canPerformAction("edit", itemOwnership, userContext)) {
    actions.push({
      id: "edit",
      label: "Edit",
      icon: Edit,
      onClick: () => interactions.onEdit?.(resume.id),
      priority: 2,
    });

    actions.push({
      id: "download",
      label: "Download",
      icon: Download,
      onClick: () => handleResumeDownload(resume.id),
      priority: 3,
    });

    actions.push({
      id: "share",
      label: "Share",
      icon: Share2,
      onClick: () => handleResumeShare(resume.id),
      priority: 4,
    });
  }

  // Recruiter actions
  if (canPerformAction("review", itemOwnership, userContext)) {
    actions.push({
      id: "download",
      label: "Download",
      icon: Download,
      onClick: () => handleResumeDownload(resume.id),
      priority: 2,
    });

    actions.push({
      id: "contact",
      label: "Contact",
      icon: MessageCircle,
      onClick: () => interactions.onContact?.(resume.id),
      priority: 3,
    });

    actions.push({
      id: "schedule",
      label: "Schedule Interview",
      icon: Calendar,
      onClick: () => handleScheduleInterview(resume.id),
      priority: 4,
    });
  }

  return actions.sort((a, b) => (a.priority || 0) - (b.priority || 0));
}

// Action handlers (these would be implemented based on your business logic)
function handleJobAnalytics(jobId: string) {
  // eslint-disable-next-line no-console
  console.log("Opening analytics for job:", jobId);
}

function handleJobStatusChange(jobId: string, status: string) {
  // eslint-disable-next-line no-console
  console.log("Changing job status:", jobId, status);
}

function handleJobClone(jobId: string) {
  // eslint-disable-next-line no-console
  console.log("Cloning job:", jobId);
}

function handleTeamManagement(companyId: string) {
  // eslint-disable-next-line no-console
  console.log("Managing team for company:", companyId);
}

function handleJobPosting(companyId: string) {
  // eslint-disable-next-line no-console
  console.log("Posting job for company:", companyId);
}

function handleResumeDownload(resumeId: string) {
  // eslint-disable-next-line no-console
  console.log("Downloading resume:", resumeId);
}

function handleResumeShare(resumeId: string) {
  // eslint-disable-next-line no-console
  console.log("Sharing resume:", resumeId);
}

function handleScheduleInterview(resumeId: string) {
  // eslint-disable-next-line no-console
  console.log("Scheduling interview for resume:", resumeId);
}
