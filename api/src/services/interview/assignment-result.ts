/**
 * Outcome type for the interview-assignment use cases
 * (services/interview/assignment-*.ts). Use cases never touch HTTP; they
 * return either data or a typed failure that the route maps 1:1 onto the
 * `{ success:false, error:{code,message} }` envelope with `status`.
 */

export type AssignmentFailureStatus = 400 | 401 | 403 | 404 | 409 | 410;

export interface AssignmentFailure {
  ok: false;
  status: AssignmentFailureStatus;
  code: string;
  message: string;
}

export interface AssignmentSuccess<T> {
  ok: true;
  data: T;
}

export type AssignmentResult<T> = AssignmentSuccess<T> | AssignmentFailure;

export function succeed<T>(data: T): AssignmentSuccess<T> {
  return { ok: true, data };
}

export function failWith(status: AssignmentFailureStatus, code: string, message: string): AssignmentFailure {
  return { ok: false, status, code, message };
}

/** Shared "interview not found" failure — same copy on every endpoint. */
export const INTERVIEW_NOT_FOUND: AssignmentFailure = failWith(404, "NOT_FOUND", "Interview not found");
