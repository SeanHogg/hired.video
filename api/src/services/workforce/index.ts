/**
 * Workforce service (#1349 Phase 1+2) — barrel.
 *
 * Owns the workforce aggregate:
 *   - punch in / out (task_time_entries)            → ./time-entries.ts
 *   - timesheet submit / approve / reject           → ./timesheets.ts
 *   - approved-timesheet invoice + payout derivation → ./timesheet-derivation.ts
 *   - seat billing reconciliation                   → ./seats.ts
 *   - employer roster + desk margin read models     → ./roster.ts, ./desk-margin.ts
 *   - placement doc vault                           → ./documents.ts
 *
 * Tenant resolution (./tenancy.ts): an employee's company is the row in
 * userCompanyRoleAssociations where role='employee' AND isActive=true.
 */

export { resolveEmployeeCompanyId, resolveEmployerCompanyIds } from "./tenancy.js";
export {
  recalculateWorkforceSeats,
  getSeatCommitment,
  authorizeSeats,
} from "./seats.js";
export type { RecalculateSeatsResult, SeatCommitment } from "./seats.js";
export { punchIn, punchOut, getActiveTimeEntry, getWeekEntries } from "./time-entries.js";
export type { PunchInRequest } from "./time-entries.js";
export {
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  getEmployeeTimesheets,
  getCompanyApprovalQueue,
} from "./timesheets.js";
export { getDeskMargin } from "./desk-margin.js";
export type { DeskMarginRow } from "./desk-margin.js";
export {
  createPlacementDocument,
  listCompanyPlacementDocuments,
  attachDocumentFile,
  markDocumentSigned,
  getDocumentForCaller,
} from "./documents.js";
export type { CreatePlacementDocumentInput } from "./documents.js";
export { getCompanyRoster } from "./roster.js";
