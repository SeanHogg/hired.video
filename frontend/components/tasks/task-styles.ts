// Shared task badge palettes — lifted out of Tasks.tsx so the page kanban and
// the reusable <TaskBoard> (Content Creator → Gigs) render task cards
// identically. Single source of truth for type + priority colours.

import { TaskType } from "@/types/task";

export const taskTypeColors: Record<number, string> = {
  [TaskType.General]: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  [TaskType.Project]: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  [TaskType.Email]: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  [TaskType.Phone]: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  [TaskType.Meeting]: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  [TaskType.Interview]: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  [TaskType.Recruiting]: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  [TaskType.Sales]: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  [TaskType.Onboarding]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.OnboardingProfile]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.OnboardingProfileSettings]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.OnboardingPrivacy]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.Recruiter]: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  [TaskType.RecruiterPreferences]: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  [TaskType.JobSeeker]: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  [TaskType.JobSeekerPreferences]: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  [TaskType.Company]: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  [TaskType.CompanySettings]: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  [TaskType.Profile]: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
  [TaskType.Job]: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  [TaskType.Resume]: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
};

export const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

// Per-status column accent for the kanban board (drop-target highlight + title).
export const KANBAN_COLUMN_ACCENT: Record<number, { active: string; text: string; pill: string }> = {
  0: { active: "bg-blue-50 border-blue-300", text: "text-blue-600", pill: "bg-blue-100 text-blue-600" },
  1: { active: "bg-yellow-50 border-yellow-300", text: "text-yellow-600", pill: "bg-yellow-100 text-yellow-600" },
  3: { active: "bg-orange-50 border-orange-300", text: "text-orange-600", pill: "bg-orange-100 text-orange-600" },
  6: { active: "bg-green-50 border-green-300", text: "text-green-600", pill: "bg-green-100 text-green-600" },
};
