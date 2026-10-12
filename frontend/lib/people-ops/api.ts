/**
 * People Operations (CHRO) API client — thin typed wrappers over the
 * shared apiClient. Returns `.data` so pages don't unwrap the envelope.
 * One module so the /api/people/* surface lives in exactly one place.
 */

import { apiClient } from "@/lib/api-client";
import type { EmploymentType } from "@shared/employment-types";
import type {
  EmployeeStatus,
  OneOnOneStatus,
  MeetingType,
  OneOnOneAgendaItem,
  ActionItemStatus,
  ActionItemPriority,
  ActionItemSource,
  GoalStatus,
  GoalPriority,
  KeyResult,
} from "@shared/people-ops";

export interface Employee {
  id: string;
  // Identity link — at most one set; none = placeholder.
  userId: string | null; // native hired.video login (the billable path)
  invitationId: string | null; // pending native invite
  externalUserId: string | null; // federated identity (embedded tenant), not billable
  /** Derived: a native user with an active company association (a paid seat). */
  billable: boolean;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  position: string;
  department: string;
  location: string | null;
  startDate: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  avatar: string | null;
  skills: string[];
  notes: string | null;
  managerId: string | null;
  performanceRating: number | null;
  salaryCents: number | null;
  salary: number | null;
  equityShares: number | null;
  isFounder: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Which foundation a roster row is anchored on. */
export type EmployeeIdentityKind = "member" | "invited" | "external" | "placeholder";

export function employeeIdentityKind(e: Employee): EmployeeIdentityKind {
  if (e.userId) return "member";
  if (e.invitationId) return "invited";
  if (e.externalUserId) return "external";
  return "placeholder";
}

export interface OrgNode {
  employee: Employee;
  reports: OrgNode[];
}

export interface TeamMetrics {
  totalHeadcount: number;
  activeHeadcount: number;
  onLeaveHeadcount: number;
  /** Native members with an active association — the seats you pay for. */
  billableSeats: number;
  avgPerformanceRating: number | null;
  upcomingOneOnOnes: number;
  departmentBreakdown: { department: string; count: number }[];
  employmentTypeBreakdown: { employmentType: string; count: number }[];
}

export interface OneOnOne {
  id: string;
  supervisorId: string;
  participantId: string;
  scheduledDate: string;
  duration: number;
  status: OneOnOneStatus;
  meetingType: MeetingType;
  location: string | null;
  meetingLink: string | null;
  agenda: OneOnOneAgendaItem[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OneOnOneTemplate {
  key: string;
  name: string;
  agenda: OneOnOneAgendaItem[];
}

export interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  assigneeEmployeeId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdBy: string;
  sourceType: ActionItemSource;
  oneOnOneId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EmployeeWrite = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  position?: string;
  department?: string;
  location?: string | null;
  startDate?: string | null;
  employmentType?: EmploymentType;
  status?: EmployeeStatus;
  skills?: string[];
  notes?: string | null;
  managerId?: string | null;
  performanceRating?: number | null;
  salary?: number | null;
  equityShares?: number | null;
  isFounder?: boolean;
};

export interface Goal {
  id: string;
  employeeId: string;
  milestoneId: string | null;
  title: string;
  description: string | null;
  status: GoalStatus;
  priority: GoalPriority;
  dueDate: string | null;
  progress: number;
  category: string | null;
  keyResults: KeyResult[];
  atRisk: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GoalWrite = {
  employeeId: string;
  title: string;
  description?: string | null;
  status?: GoalStatus;
  priority?: GoalPriority;
  dueDate?: string | null;
  progress?: number;
  category?: string | null;
  keyResults?: KeyResult[];
};

export type OneOnOneWrite = {
  supervisorId: string;
  participantId: string;
  scheduledDate: string;
  duration?: number;
  status?: OneOnOneStatus;
  meetingType?: MeetingType;
  location?: string | null;
  meetingLink?: string | null;
  notes?: string | null;
};

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const peopleApi = {
  // Employees
  listEmployees: (filters: Partial<Record<"department" | "status" | "employmentType" | "managerId" | "q", string>> = {}) =>
    apiClient.get<Employee[]>(`/api/people/employees${qs(filters)}`).then((r) => r.data),
  getEmployee: (id: string) =>
    apiClient.get<Employee>(`/api/people/employees/${id}`).then((r) => r.data),
  createEmployee: (body: EmployeeWrite) =>
    apiClient.post<Employee>(`/api/people/employees`, body).then((r) => r.data),
  updateEmployee: (id: string, body: Partial<EmployeeWrite>) =>
    apiClient.put<Employee>(`/api/people/employees/${id}`, body).then((r) => r.data),
  deleteEmployee: (id: string) =>
    apiClient.delete<{ deleted: boolean }>(`/api/people/employees/${id}`).then((r) => r.data),
  hierarchy: () =>
    apiClient.get<OrgNode[]>(`/api/people/employees/hierarchy`).then((r) => r.data),
  teamMetrics: () =>
    apiClient.get<TeamMetrics>(`/api/people/analytics/team-metrics`).then((r) => r.data),

  // 1:1s
  listOneOnOnes: (filters: Partial<Record<"supervisorId" | "participantId" | "status" | "employeeId", string>> = {}) =>
    apiClient.get<OneOnOne[]>(`/api/people/one-on-ones${qs(filters)}`).then((r) => r.data),
  oneOnOneTemplates: () =>
    apiClient.get<OneOnOneTemplate[]>(`/api/people/one-on-ones/templates`).then((r) => r.data),
  getOneOnOne: (id: string) =>
    apiClient.get<OneOnOne>(`/api/people/one-on-ones/${id}`).then((r) => r.data),
  createOneOnOne: (body: OneOnOneWrite) =>
    apiClient.post<OneOnOne>(`/api/people/one-on-ones`, body).then((r) => r.data),
  updateOneOnOne: (id: string, body: Partial<OneOnOneWrite>) =>
    apiClient.patch<OneOnOne>(`/api/people/one-on-ones/${id}`, body).then((r) => r.data),
  deleteOneOnOne: (id: string) =>
    apiClient.delete<{ deleted: boolean }>(`/api/people/one-on-ones/${id}`).then((r) => r.data),
  addAgendaItem: (id: string, item: { title: string; description?: string; status?: string }) =>
    apiClient.post<OneOnOne>(`/api/people/one-on-ones/${id}/agenda-items`, item).then((r) => r.data),
  updateAgendaItem: (id: string, index: number, patch: Partial<OneOnOneAgendaItem>) =>
    apiClient.patch<OneOnOne>(`/api/people/one-on-ones/${id}/agenda-items/${index}`, patch).then((r) => r.data),
  deleteAgendaItem: (id: string, index: number) =>
    apiClient.delete<OneOnOne>(`/api/people/one-on-ones/${id}/agenda-items/${index}`).then((r) => r.data),
  addActionItems: (id: string, items: { title: string; description?: string; assigneeEmployeeId?: string; dueDate?: string }[]) =>
    apiClient.post<ActionItem[]>(`/api/people/one-on-ones/${id}/action-items`, { items }).then((r) => r.data),

  // Action items
  listActionItems: (filters: Partial<Record<"status" | "sourceType" | "oneOnOneId" | "assigneeEmployeeId", string>> = {}) =>
    apiClient.get<ActionItem[]>(`/api/people/action-items${qs(filters)}`).then((r) => r.data),

  // Goals / OKRs (PO-4)
  listGoals: (filters: Partial<Record<"employeeId" | "status" | "category", string>> = {}) =>
    apiClient.get<Goal[]>(`/api/people/goals${qs(filters)}`).then((r) => r.data),
  createGoal: (body: GoalWrite) =>
    apiClient.post<Goal>(`/api/people/goals`, body).then((r) => r.data),
  updateGoal: (id: string, body: Partial<GoalWrite>) =>
    apiClient.put<Goal>(`/api/people/goals/${id}`, body).then((r) => r.data),
  deleteGoal: (id: string) =>
    apiClient.delete<{ deleted: boolean }>(`/api/people/goals/${id}`).then((r) => r.data),
};

export function employeeName(e: Pick<Employee, "firstName" | "lastName">): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

// ── Generic segment-scoped resource client (DRY) ─────────────────────────────
// Covers the remaining People-Ops surfaces (objectives, milestones, reviews,
// pulse, check-ins, syncs, scorecards, meeting-intel, workflows, headcount,
// pto) without a bespoke client each. Rows are loose records — the
// ResourceManager descriptor names the columns/fields.
export type PeopleRecord = Record<string, any>;

export function peopleResource(path: string) {
  const base = `/api/people/${path}`;
  return {
    list: () => apiClient.get<PeopleRecord[]>(base).then((r) => r.data),
    get: (id: string) => apiClient.get<PeopleRecord>(`${base}/${id}`).then((r) => r.data),
    create: (body: PeopleRecord) => apiClient.post<PeopleRecord>(base, body).then((r) => r.data),
    update: (id: string, body: PeopleRecord) => apiClient.put<PeopleRecord>(`${base}/${id}`, body).then((r) => r.data),
    remove: (id: string) => apiClient.delete<{ deleted: boolean }>(`${base}/${id}`).then((r) => r.data),
  };
}

export interface TeamHealth {
  score: number;
  dimensions: Record<string, number>;
  weights: Record<string, number>;
  headcount: number;
  sampleSizes: Record<string, number>;
}
export const teamHealthApi = {
  get: () => apiClient.get<TeamHealth>(`/api/people/team-health`).then((r) => r.data),
};

export interface TcoBreakdown {
  annualSalary: number; payrollTaxes: number; benefits: number; perks: number;
  overhead: number; recruiting: number; training: number;
  totalLoadedCost: number; monthlyLoadedCost: number;
}
/** TCO multipliers + the runway inputs the headcount summary uses
 *  (`runwayImpactDays`); cash/burn are minor units, null until entered. */
export interface TcoAssumptions {
  payrollTaxesPct: number;
  benefitsPct: number;
  perksPct: number;
  overheadPct: number;
  cashOnHandCents: number | null;
  monthlyBurnCents: number | null;
}
export const tcoApi = {
  assumptions: () => apiClient.get<TcoAssumptions>(`/api/people/tco/assumptions`).then((r) => r.data),
  saveAssumptions: (b: TcoAssumptions) => apiClient.put<TcoAssumptions>(`/api/people/tco/assumptions`, b).then((r) => r.data),
  calculate: (annualSalary: number) => apiClient.post<TcoBreakdown>(`/api/people/tco/calculate`, { annualSalary }).then((r) => r.data),
};
