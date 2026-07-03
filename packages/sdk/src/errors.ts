import type { HiredErrorCode } from "./types.js";

/** Thrown for any non-2xx response from the Hired.Video API. */
export class HiredApiError extends Error {
  constructor(
    /** HTTP status. */
    public readonly status: number,
    /** Machine-readable code from the API envelope. One of {@link HiredErrorCode}
     *  for known failures; a `HTTP_<status>` fallback otherwise. */
    public readonly code: HiredErrorCode | (string & {}),
    message: string,
    /** Optional structured details from the API. */
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HiredApiError";
  }

  /** True when the failure is an idempotency/duplicate hit you can treat as
   *  success (`EMAIL_EXISTS` or `ALREADY_EXISTS`). */
  get isAlreadyExists(): boolean {
    return this.code === "ALREADY_EXISTS" || this.code === "EMAIL_EXISTS";
  }

  /** Narrowing type-guard for catch blocks. */
  static is(err: unknown): err is HiredApiError {
    return err instanceof HiredApiError;
  }
}

/** Thrown before any request when the SDK is misconfigured. */
export class HiredConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HiredConfigError";
  }
}
