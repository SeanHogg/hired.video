/**
 * segmentStore — the People-Ops surface routers' one door to the segment-scoped
 * tables. Routes name a table by its registry key (never import `db/schema`);
 * this resolves it to a `PeopleSegmentRepo` over the request-scoped db, so the
 * (tenant, segment) no-bleed filter stays automatic.
 *
 * Also owns the shared parent→child pattern (outcomes under an objective,
 * responses under a pulse check, snapshots under a scorecard, …): the child is
 * written only when the parent is in the caller's segment.
 */

import { getDb, schema } from "../../db/index.js";
import { PeopleSegmentRepo } from "../../repositories/peopleSegmentRepo.js";
import { PeopleEmployeesRepository, type SegmentScope } from "../../repositories/peopleEmployeesRepository.js";

export const PEOPLE_SEGMENT_TABLES = {
  weeklySyncs: schema.peopleWeeklySyncs,
  scorecards: schema.peopleScorecards,
  scorecardSnapshots: schema.peopleScorecardSnapshots,
  meetingTranscripts: schema.peopleMeetingTranscripts,
  workflowTriggers: schema.peopleWorkflowTriggers,
  workflowExecutions: schema.peopleWorkflowExecutions,
  strategicObjectives: schema.peopleStrategicObjectives,
  objectiveOutcomes: schema.peopleObjectiveOutcomes,
  objectiveMilestones: schema.peopleObjectiveMilestones,
  companyMilestones: schema.peopleCompanyMilestones,
  performanceReviews: schema.peoplePerformanceReviews,
  pulseChecks: schema.peoplePulseChecks,
  pulseResponses: schema.peoplePulseResponses,
  scheduledCheckIns: schema.peopleScheduledCheckIns,
  checkInResponses: schema.peopleCheckInResponses,
  tcoSettings: schema.peopleTcoSettings,
  roleDefinitions: schema.peopleRoleDefinitions,
  headcountPlans: schema.peopleHeadcountPlans,
  ptoRequests: schema.peoplePtoRequests,
} as const;

export type PeopleSegmentTable = keyof typeof PEOPLE_SEGMENT_TABLES;

/** A segment-scoped repo for one People-Ops table. */
export function segmentStore(table: PeopleSegmentTable): PeopleSegmentRepo {
  return new PeopleSegmentRepo(getDb(), PEOPLE_SEGMENT_TABLES[table]);
}

/** Children of `parentId`, newest first by `orderField` (default created_at). */
export function listChildren(
  s: SegmentScope,
  child: PeopleSegmentTable,
  fkField: string,
  parentId: string,
  orderField?: string,
): Promise<any[]> {
  return segmentStore(child).listByField(s, fkField, parentId, orderField);
}

/**
 * Insert a child row under an in-segment parent. Returns null when the parent
 * is missing / out of segment (the route answers its own 404).
 */
export async function insertChild(
  s: SegmentScope,
  parent: PeopleSegmentTable,
  child: PeopleSegmentTable,
  fkField: string,
  parentId: string,
  values: Record<string, unknown>,
): Promise<any | null> {
  if (!(await segmentStore(parent).findById(s, parentId))) return null;
  return segmentStore(child).insert(s, { ...values, [fkField]: parentId });
}

/** The subset of `ids` that are roster employees in the caller's segment (ONE lookup). */
export async function rosterEmployeeIds(s: SegmentScope, ids: readonly string[]): Promise<Set<string>> {
  const rows = await new PeopleEmployeesRepository(getDb()).findManyByIds(s, ids);
  return new Set(rows.map((r) => r.id));
}
