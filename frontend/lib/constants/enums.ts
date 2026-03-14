/**
 * Centralized enum definitions matching backend enums
 * These must match the backend enums exactly to ensure consistency
 */

/**
 * Employment Type - matches backend enum
 */
export const EmploymentType = {
  FullTime: 0,
  PartTime: 1,
  Contract: 2,
  Internship: 3,
  Temporary: 4,
  Freelance: 5,
} as const;

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: EmploymentType.FullTime, label: "Full-time" },
  { value: EmploymentType.PartTime, label: "Part-time" },
  { value: EmploymentType.Contract, label: "Contract" },
  { value: EmploymentType.Internship, label: "Internship" },
  { value: EmploymentType.Temporary, label: "Temporary" },
  { value: EmploymentType.Freelance, label: "Freelance" },
] as const;

/**
 * Work Setting - matches backend enum
 */
export const WorkSetting = {
  OnSite: 0,
  Remote: 1,
  Hybrid: 2,
} as const;

export const WORK_SETTING_OPTIONS = [
  { value: WorkSetting.OnSite, label: "Onsite" },
  { value: WorkSetting.Remote, label: "Remote" },
  { value: WorkSetting.Hybrid, label: "Hybrid" },
] as const;

/**
 * Display Privacy - matches backend enum
 */
export const DisplayPrivacy = {
  ToPublic: 0,
  ToRecruiters: 1,
  ToConnections: 2,
  ToSelf: 10,
} as const;

export const DISPLAY_PRIVACY_OPTIONS = [
  { value: DisplayPrivacy.ToPublic, label: "Visible to Public" },
  { value: DisplayPrivacy.ToRecruiters, label: "Visible to Recruiters" },
  { value: DisplayPrivacy.ToConnections, label: "Visible to Connections" },
  { value: DisplayPrivacy.ToSelf, label: "Visible to Self (Private)" },
] as const;

/**
 * Job Status - matches backend enum
 */
export const JobStatus = {
  Draft: 0,
  Open: 1,
  Closed: 2,
  Hired: 3,
} as const;

export const JOB_STATUS_OPTIONS = [
  { value: JobStatus.Draft, label: "Draft" },
  { value: JobStatus.Open, label: "Open" },
  { value: JobStatus.Closed, label: "Closed" },
  { value: JobStatus.Hired, label: "Hired" },
] as const;

/**
 * Job Application Status
 */
export const JobApplicationStatus = {
  System: 0,
  Saved: 1,
  Applied: 2,
  Longlist: 3,
  Shortlist: 4,
  Outbound: 5,
  Screening: 6,
  Submitted: 7,
  Reviewing: 8,
  Interviewing: 9,
  Rejected: 10,
  Closed: 11,
  Hired: 12,
} as const;

/**
 * Job Application Status Labels - for display in UI
 */
export const JOB_APPLICATION_STATUS_LABELS: Record<string, string> = {
  Pending: "Pending",
  Reviewing: "Reviewing",
  Interviewing: "Interviewing",
  Offered: "Offered",
  Rejected: "Rejected",
  Withdrawn: "Withdrawn",
  Accepted: "Accepted",
  System: "System",
  Saved: "Saved",
  Applied: "Applied",
  Longlist: "Longlist",
  Shortlist: "Shortlist",
  Outbound: "Outbound",
  Screening: "Screening",
  Submitted: "Submitted",
  Closed: "Closed",
  Hired: "Hired",
};

/**
 * Job Application Status Colors - for badge styling
 */
export const JOB_APPLICATION_STATUS_COLORS: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Reviewing: "bg-blue-100 text-blue-800 border-blue-300",
  Interviewing: "bg-purple-100 text-purple-800 border-purple-300",
  Offered: "bg-green-100 text-green-800 border-green-300",
  Rejected: "bg-red-100 text-red-800 border-red-300",
  Withdrawn: "bg-gray-100 text-gray-800 border-gray-300",
  Accepted: "bg-emerald-100 text-emerald-800 border-emerald-300",
  System: "bg-slate-100 text-slate-800 border-slate-300",
  Saved: "bg-indigo-100 text-indigo-800 border-indigo-300",
  Applied: "bg-cyan-100 text-cyan-800 border-cyan-300",
  Longlist: "bg-orange-100 text-orange-800 border-orange-300",
  Shortlist: "bg-pink-100 text-pink-800 border-pink-300",
  Outbound: "bg-teal-100 text-teal-800 border-teal-300",
  Screening: "bg-violet-100 text-violet-800 border-violet-300",
  Submitted: "bg-amber-100 text-amber-800 border-amber-300",
  Closed: "bg-gray-100 text-gray-800 border-gray-300",
  Hired: "bg-green-100 text-green-800 border-green-300",
};

/**
 * Job Alert Frequency Labels
 */
export const JOB_ALERT_FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  immediate: "Immediate",
};

/**
 * Helper function to get label for enum value
 */
export function getEnumLabel(
  options: readonly { value: number; label: string }[],
  value: number,
): string {
  return options.find((opt) => opt.value === value)?.label || String(value);
}

