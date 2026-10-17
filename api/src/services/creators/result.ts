/**
 * Outcome of a creators use case: either data + the success status, or a
 * typed failure (HTTP status + error code + message) the route maps 1:1
 * onto the `error()` envelope.
 */
export type CreatorFailureStatus = 400 | 402 | 403 | 404 | 409 | 502;

export type CreatorResult<T> =
  | { ok: true; status: 200 | 201; data: T }
  | { ok: false; status: CreatorFailureStatus; code: string; message: string };

export function ok<T>(data: T, status: 200 | 201 = 200): CreatorResult<T> {
  return { ok: true, status, data };
}

export function fail<T = never>(status: CreatorFailureStatus, code: string, message: string): CreatorResult<T> {
  return { ok: false, status, code, message };
}
