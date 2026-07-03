/** Thrown for any non-2xx response from the Hired.Video API. */
export class HiredApiError extends Error {
  constructor(
    /** HTTP status. */
    public readonly status: number,
    /** Machine-readable code from the API envelope (e.g. "EMAIL_EXISTS"). */
    public readonly code: string,
    message: string,
    /** Optional structured details from the API. */
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HiredApiError";
  }
}

/** Thrown before any request when the SDK is misconfigured. */
export class HiredConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HiredConfigError";
  }
}
