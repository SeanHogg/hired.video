// Shared task badge palettes — lifted out of Tasks.tsx so the page kanban and
// the reusable <TaskBoard> (Content Creator → Gigs) render task cards
// identically. Single source of truth for type + priority colours.

import { TaskType } from "@/types/task";

export const taskTypeColors: Record<number, string> = {
  [TaskType.General]: "bg-muted text-foreground",
  [TaskType.Project]: "bg-accent text-accent-foreground",
  [TaskType.Email]: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  [TaskType.Phone]: "bg-accent text-accent-foreground",
  [TaskType.Meeting]: "bg-amber-100 text-amber-800 dark:bg-orange-900 dark:text-orange-200",
  [TaskType.Interview]: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  [TaskType.Recruiting]: "bg-accent text-accent-foreground",
  [TaskType.Sales]: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  [TaskType.Onboarding]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.OnboardingProfile]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.OnboardingProfileSettings]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.OnboardingPrivacy]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.Recruiter]: "bg-accent text-accent-foreground",
  [TaskType.RecruiterPreferences]: "bg-accent text-accent-foreground",
  [TaskType.JobSeeker]: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  [TaskType.JobSeekerPreferences]: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  [TaskType.Company]: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  [TaskType.CompanySettings]: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  [TaskType.Profile]: "bg-muted text-foreground",
  [TaskType.Job]: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  [TaskType.Resume]: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
};

export const priorityColors: Record<string, string> = {
  low: "bg-muted text-foreground",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

// Per-status column accent for the kanban board (drop-target highlight + title).
export const KANBAN_COLUMN_ACCENT: Record<number, { active: string; text: string; pill: string }> = {
  0: { active: "bg-accent border-primary/30", text: "text-primary", pill: "bg-accent text-primary" },
  1: { active: "bg-yellow-50 border-yellow-300", text: "text-yellow-600", pill: "bg-yellow-100 text-yellow-600" },
  3: { active: "bg-amber-50 border-amber-300", text: "text-amber-600", pill: "bg-amber-100 text-amber-600" },
  6: { active: "bg-green-50 border-green-300", text: "text-green-600", pill: "bg-green-100 text-green-600" },
};
