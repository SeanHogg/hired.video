/**
 * The ONE place an ads-side row's promotion target is read and written
 * (#176). Rows carry the polymorphic pair `subject_type` + `subject_id`
 * (mig 0516); job_boosts / company_boosts also keep their legacy typed FK
 * (job_id / company_id) until its retirement follow-up.
 *
 *   resolveAdContentTarget(row)  — reader: the pair when stamped, else the
 *                                  legacy FK (a row written before 0516 ran,
 *                                  or by a not-yet-redeployed Worker).
 *   adSubjectColumns(target)     — writer: the column values for an insert,
 *                                  including the legacy FK for job/company.
 *
 * Pure — no DB, no runtime imports beyond the shared vocabulary.
 */

import {
  isAdSubjectType,
  type AdContentTarget,
} from "../../../../shared/ad-content-target.js";

/** Any ads-side row shape: `ads`, `job_boosts`, `company_boosts`. */
export interface AdTargetRow {
  subjectType?: string | null;
  subjectId?: string | null;
  jobId?: string | null;
  companyId?: string | null;
}

export function resolveAdContentTarget(row: AdTargetRow): AdContentTarget | null {
  if (row.subjectType && row.subjectId && isAdSubjectType(row.subjectType)) {
    return { subjectType: row.subjectType, subjectId: row.subjectId };
  }
  if (row.jobId) return { subjectType: "job", subjectId: row.jobId };
  if (row.companyId) return { subjectType: "company", subjectId: row.companyId };
  return null;
}

/** Column values for writing `target` onto an ads-side row. The legacy FK
 *  is included for job / company targets so job_boosts.job_id and
 *  company_boosts.company_id keep being written alongside the pair. */
export function adSubjectColumns(target: AdContentTarget): {
  subjectType: string;
  subjectId: string;
  jobId?: string;
  companyId?: string;
} {
  const base = { subjectType: target.subjectType, subjectId: target.subjectId };
  if (target.subjectType === "job") return { ...base, jobId: target.subjectId };
  if (target.subjectType === "company") return { ...base, companyId: target.subjectId };
  return base;
}
