/**
 * DomainError — the ONE typed failure a service/use case throws instead of
 * building an HTTP envelope. Services return plain data on success and throw
 * this on a rule violation; the HTTP layer (handlers/shared.ts
 * `toHandlerResult`) maps it onto the `{ success:false, error }` envelope.
 *
 * `status` is the failure's classification, expressed with the HTTP status
 * numbers the API already documents (400 invalid, 401 unauthenticated,
 * 403 forbidden, 404 not found, 409 conflict, 423 locked, 429 rate limited,
 * 5xx upstream/internal) so every response keeps its exact status code.
 */
export class DomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

/** The authenticated viewer's id, or a 401 DomainError for anonymous calls. */
export function requireUserId(viewerId: string | null | undefined): string {
  if (!viewerId) throw new DomainError(401, "UNAUTHORIZED", "Authentication required");
  return viewerId;
}
