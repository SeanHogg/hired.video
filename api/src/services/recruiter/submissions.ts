/**
 * Recruiter → job candidate submission use cases (create, list, status,
 * withdraw). The print-ready packet (#243) is packet-renderer.ts.
 * Route: routes/recruiter/submissions.ts.
 */
import {
  findOwnedSubmission,
  insertSubmission,
  listSubmissionsForJob,
  listSubmissionsForRecruiter,
  updateOwnedSubmission,
  type SubmissionRow,
} from "../../repositories/recruiterSubmissionsRepository.js";
import type { JsonBody } from "./talent-pool.js";
import { LEGACY_SUBMISSION_STATUS_MAP, SUBMISSION_STATUSES, parseStatus } from "../../../../shared/statuses.js";

export type SubmissionDto = ReturnType<typeof rowToSubmission>;

export function rowToSubmission(row: SubmissionRow) {
  return {
    id: row.id,
    recruiterUserId: row.recruiterId,
    recruiterName: "",
    candidateUserId: row.candidateId,
    candidateName: row.candidateName,
    candidateEmail: row.candidateEmail ?? null,
    jobId: row.jobId ?? "",
    jobTitle: row.jobTitle ?? "",
    companyName: row.companyName ?? "",
    resumeId: row.resumeId ?? null,
    coverLetter: row.coverLetter ?? null,
    recruiterNotes: row.recruiterNotes ?? null,
    proposedSalary: row.proposedSalary != null ? Number(row.proposedSalary) : null,
    availableStartDate: row.availableStartDate?.toISOString() ?? null,
    status: row.status,
    statusNotes: row.statusNotes ?? null,
    interviewDate: row.interviewDate?.toISOString() ?? null,
    withdrawalReason: row.withdrawalReason ?? null,
    withdrawalNotes: row.withdrawalNotes ?? null,
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const toDto = (row: SubmissionRow | null): SubmissionDto | null => (row ? rowToSubmission(row) : null);

export async function listSubmissionsByJob(recruiterId: string, jobId: string): Promise<SubmissionDto[]> {
  return (await listSubmissionsForJob(recruiterId, jobId)).map(rowToSubmission);
}

export async function createSubmission(recruiterId: string, body: JsonBody): Promise<SubmissionDto> {
  const sub = await insertSubmission({
    recruiterId,
    candidateId: body.candidateUserId ?? body.candidateId,
    candidateName: body.candidateName ?? "",
    candidateEmail: body.candidateEmail ?? null,
    jobId: body.jobId ?? null,
    jobTitle: body.jobTitle ?? null,
    companyName: body.companyName ?? null,
    resumeId: body.resumeId ?? null,
    coverLetter: body.coverLetter ?? null,
    recruiterNotes: body.recruiterNotes ?? null,
    proposedSalary: body.proposedSalary ?? null,
    availableStartDate: body.availableStartDate ? new Date(body.availableStartDate) : null,
    status: "submitted",
    notes: body.notes ?? null,
  });
  return rowToSubmission(sub);
}

export async function listSubmissions(recruiterId: string): Promise<SubmissionDto[]> {
  return (await listSubmissionsForRecruiter(recruiterId)).map(rowToSubmission);
}

export async function getSubmission(recruiterId: string, id: string): Promise<SubmissionDto | null> {
  return toDto(await findOwnedSubmission(recruiterId, id));
}

export async function updateSubmissionStatus(recruiterId: string, id: string, body: JsonBody): Promise<SubmissionDto | null> {
  return toDto(await updateOwnedSubmission(recruiterId, id, {
    status: parseStatus(SUBMISSION_STATUSES, body.status, "submitted", LEGACY_SUBMISSION_STATUS_MAP),
    statusNotes: body.statusNotes ?? null,
    interviewDate: body.interviewDate ? new Date(body.interviewDate) : undefined,
    updatedAt: new Date(),
  }));
}

export async function withdrawSubmission(recruiterId: string, id: string, body: JsonBody): Promise<SubmissionDto | null> {
  return toDto(await updateOwnedSubmission(recruiterId, id, {
    status: "withdrawn",
    withdrawalReason: body.reason ?? null,
    withdrawalNotes: body.notes ?? null,
    withdrawnAt: new Date(),
    updatedAt: new Date(),
  }));
}
