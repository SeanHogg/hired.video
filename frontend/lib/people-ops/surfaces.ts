/**
 * People-Ops surface registry — drives the generic ResourceManager + hub so we
 * don't hand-write a bespoke page per CRUD surface. Each descriptor names the
 * API path, the list columns, and the create-form fields. Bespoke surfaces
 * (team-health, tco) have their own pages and are listed in HUB_LINKS only.
 */

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "employee";
  options?: { value: string; label: string }[];
  required?: boolean;
}
export interface ColumnDef { key: string; label: string; kind?: "date" | "badge" | "text" | "progress" }
export interface SurfaceDef {
  key: string;
  title: string;
  subtitle: string;
  path: string; // under /api/people/
  columns: ColumnDef[];
  fields: FieldDef[];
}

const sel = (vals: string[]) => vals.map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

export const SURFACES: Record<string, SurfaceDef> = {
  "strategic-objectives": {
    key: "strategic-objectives",
    title: "Strategic Objectives",
    subtitle: "Company objectives with measurable outcomes and milestones.",
    path: "strategic-objectives",
    columns: [
      { key: "title", label: "Objective" },
      { key: "category", label: "Category", kind: "badge" },
      { key: "timeframe", label: "Timeframe", kind: "badge" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "progress", label: "Progress", kind: "progress" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Category", type: "select", options: sel(["strategic", "operational", "financial", "talent", "customer", "product", "market", "revenue", "team", "fundraising"]) },
      { name: "timeframe", label: "Timeframe", type: "select", options: sel(["quarterly", "annual", "multi_year"]) },
      { name: "endDate", label: "Target date", type: "date" },
    ],
  },
  milestones: {
    key: "milestones",
    title: "Company Milestones",
    subtitle: "Product, revenue, funding, and team milestones.",
    path: "milestones",
    columns: [
      { key: "title", label: "Milestone" },
      { key: "category", label: "Category", kind: "badge" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "targetDate", label: "Target", kind: "date" },
      { key: "progress", label: "Progress", kind: "progress" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Category", type: "select", options: sel(["product", "revenue", "funding", "team", "customer", "operational", "partnership", "compliance"]) },
      { name: "targetDate", label: "Target date", type: "date" },
    ],
  },
  "performance-reviews": {
    key: "performance-reviews",
    title: "Performance Reviews",
    subtitle: "Review cycles, ratings, and feedback.",
    path: "performance-reviews",
    columns: [
      { key: "employeeId", label: "Employee", kind: "text" },
      { key: "reviewType", label: "Type", kind: "badge" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "scheduledDate", label: "Scheduled", kind: "date" },
      { key: "rating", label: "Rating" },
    ],
    fields: [
      { name: "employeeId", label: "Employee", type: "employee", required: true },
      { name: "reviewerId", label: "Reviewer", type: "employee" },
      { name: "reviewType", label: "Type", type: "select", options: sel(["quarterly", "annual", "mid_year", "probation", "three_sixty"]) },
      { name: "scheduledDate", label: "Scheduled date", type: "date" },
      { name: "periodLabel", label: "Period (e.g. Q1 2026)", type: "text" },
    ],
  },
  "pulse-checks": {
    key: "pulse-checks",
    title: "Pulse Checks",
    subtitle: "Recurring team-health surveys.",
    path: "pulse-checks",
    columns: [
      { key: "title", label: "Pulse" },
      { key: "frequency", label: "Frequency", kind: "badge" },
      { key: "isActive", label: "Active", kind: "badge" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "frequency", label: "Frequency", type: "select", options: sel(["daily", "weekly", "biweekly", "monthly"]) },
    ],
  },
  "scheduled-check-ins": {
    key: "scheduled-check-ins",
    title: "Scheduled Check-ins",
    subtitle: "Automated recurring async check-ins.",
    path: "scheduled-check-ins",
    columns: [
      { key: "name", label: "Check-in" },
      { key: "frequency", label: "Frequency", kind: "badge" },
      { key: "time", label: "Time" },
      { key: "isActive", label: "Active", kind: "badge" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "frequency", label: "Frequency", type: "select", options: sel(["daily", "weekly", "biweekly", "monthly"]) },
      { name: "time", label: "Time (HH:MM)", type: "text" },
      { name: "timezone", label: "Timezone", type: "text" },
    ],
  },
  "weekly-syncs": {
    key: "weekly-syncs",
    title: "Weekly Syncs",
    subtitle: "Operating-cadence sync meetings.",
    path: "weekly-syncs",
    columns: [
      { key: "title", label: "Sync" },
      { key: "scheduledDate", label: "When", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "scheduledDate", label: "Date & time", type: "date", required: true },
      { name: "meetingLink", label: "Meeting link", type: "text" },
    ],
  },
  scorecards: {
    key: "scorecards",
    title: "Scorecards",
    subtitle: "Operating scorecards with metric snapshots.",
    path: "scorecards",
    columns: [
      { key: "name", label: "Scorecard" },
      { key: "category", label: "Category", kind: "badge" },
      { key: "isActive", label: "Active", kind: "badge" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Category", type: "select", options: sel(["okr", "kpi", "health", "team", "product", "financial", "operations", "sales", "growth"]) },
    ],
  },
  "meeting-intelligence": {
    key: "meeting-intelligence",
    title: "Meeting Intelligence",
    subtitle: "Transcripts with AI summaries and action items.",
    path: "meeting-intelligence",
    columns: [
      { key: "title", label: "Meeting" },
      { key: "meetingType", label: "Type", kind: "badge" },
      { key: "recordedAt", label: "Recorded", kind: "date" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "meetingType", label: "Type", type: "text" },
      { name: "transcript", label: "Transcript", type: "textarea", required: true },
    ],
  },
  workflows: {
    key: "workflows",
    title: "Workflow Automation",
    subtitle: "Trigger-action workflows for HR ops.",
    path: "workflows",
    columns: [
      { key: "name", label: "Workflow" },
      { key: "triggerType", label: "Trigger", kind: "badge" },
      { key: "isActive", label: "Active", kind: "badge" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "triggerType", label: "Trigger", type: "select", options: sel(["schedule", "event", "condition", "milestone", "metric", "manual"]) },
    ],
  },
  "headcount/roles": {
    key: "headcount/roles",
    title: "Role Definitions",
    subtitle: "Comp bands by role and level.",
    path: "headcount/roles",
    columns: [
      { key: "title", label: "Role" },
      { key: "department", label: "Department" },
      { key: "level", label: "Level" },
      { key: "baseSalaryCents", label: "Base (¢)" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "department", label: "Department", type: "text" },
      { name: "level", label: "Level", type: "text" },
      { name: "baseSalaryCents", label: "Base salary (cents)", type: "number" },
    ],
  },
  "headcount/plans": {
    key: "headcount/plans",
    title: "Headcount Plans",
    subtitle: "Hiring plans with cost + runway impact.",
    path: "headcount/plans",
    columns: [
      { key: "name", label: "Plan" },
      { key: "fiscalYear", label: "FY" },
      { key: "totalHeadcount", label: "Headcount" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "fiscalYear", label: "Fiscal year", type: "text" },
      { name: "totalHeadcount", label: "Target headcount", type: "number" },
    ],
  },
  pto: {
    key: "pto",
    title: "PTO & Leave",
    subtitle: "Time-off requests and approvals.",
    path: "pto",
    columns: [
      { key: "employeeId", label: "Employee", kind: "text" },
      { key: "type", label: "Type", kind: "badge" },
      { key: "startDate", label: "Start", kind: "date" },
      { key: "endDate", label: "End", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    fields: [
      { name: "employeeId", label: "Employee", type: "employee", required: true },
      { name: "type", label: "Type", type: "select", options: sel(["vacation", "sick", "parental", "bereavement", "unpaid"]) },
      { name: "startDate", label: "Start date", type: "date", required: true },
      { name: "endDate", label: "End date", type: "date", required: true },
      { name: "days", label: "Days", type: "number" },
    ],
  },
};

/** Hub tiles — the full People-Ops surface set, including bespoke pages. */
export const HUB_LINKS: { title: string; href: string; description: string }[] = [
  { title: "Roster & Org Chart", href: "/people/roster", description: "Team directory and org chart." },
  { title: "1:1s", href: "/people/one-on-ones", description: "Recurring 1:1 cadence with action items." },
  { title: "Goals & OKRs", href: "/people/goals", description: "OKRs with key-result rollup." },
  { title: "Team Health", href: "/people/team-health", description: "Composite team-health score." },
  { title: "Strategic Objectives", href: "/people/s/strategic-objectives", description: "Objectives, outcomes, milestones." },
  { title: "Company Milestones", href: "/people/s/milestones", description: "Product/revenue/funding milestones." },
  { title: "Performance Reviews", href: "/people/s/performance-reviews", description: "Review cycles and ratings." },
  { title: "Pulse Checks", href: "/people/s/pulse-checks", description: "Recurring team-health surveys." },
  { title: "Scheduled Check-ins", href: "/people/s/scheduled-check-ins", description: "Automated async check-ins." },
  { title: "Weekly Syncs", href: "/people/s/weekly-syncs", description: "Operating-cadence syncs." },
  { title: "Scorecards", href: "/people/s/scorecards", description: "Operating scorecards + snapshots." },
  { title: "Meeting Intelligence", href: "/people/s/meeting-intelligence", description: "AI meeting summaries." },
  { title: "Workflow Automation", href: "/people/s/workflows", description: "Trigger-action HR workflows." },
  { title: "Employee TCO", href: "/people/tco", description: "Fully-loaded cost calculator." },
  { title: "Role Definitions", href: "/people/s/headcount/roles", description: "Comp bands by role." },
  { title: "Headcount Plans", href: "/people/s/headcount/plans", description: "Hiring plans + cost." },
  { title: "PTO & Leave", href: "/people/s/pto", description: "Time-off requests + approvals." },
];
