import { HiredApiError, HiredConfigError } from "./errors.js";
import type {
  PartnerInfo,
  PartnerScope,
  CreateJobSeekerInput,
  CreateJobSeekerResult,
  UploadResumeInput,
  ConnectInput,
  ConnectResult,
  PartnerConnection,
  ProfilePayload,
  CreateEmbedTokenInput,
  EmbedToken,
} from "./types.js";

const DEFAULT_BASE_URL = "https://hired.video";

export interface HiredClientOptions {
  /** Your partner API key (`hvpk_...`). Server-side ONLY — never ship this to
   *  a browser. Issue keys from the Hired.Video SuperAdmin partner console. */
  apiKey: string;
  /** Override the API origin (e.g. a staging deploy). Defaults to
   *  https://hired.video. */
  baseUrl?: string;
  /** Inject a fetch implementation (Node < 18, tests). Defaults to global
   *  fetch. */
  fetch?: typeof fetch;
}

/** Envelope every Hired.Video API route returns. */
interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

/**
 * The Hired.Video partner client. Authenticates system-to-system with a partner
 * API key. All methods return the `data` payload directly and throw
 * {@link HiredApiError} on any non-2xx response.
 *
 * ```ts
 * const hired = new HiredClient({ apiKey: process.env.HIRED_API_KEY! });
 * const { userId, claimUrl } = await hired.jobSeekers.create({
 *   email: "jane@example.com",
 *   name: "Jane Doe",
 *   resume: { rawText: resumeText },
 * });
 * ```
 */
export class HiredClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HiredClientOptions) {
    if (!options?.apiKey) throw new HiredConfigError("`apiKey` is required.");
    if (!options.apiKey.startsWith("hvpk_")) {
      throw new HiredConfigError('Invalid partner key — expected an "hvpk_" key.');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const f = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (!f) {
      throw new HiredConfigError(
        "No fetch implementation available. Pass `fetch` in options or run on Node 18+.",
      );
    }
    this.fetchImpl = f;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let envelope: Envelope<T> | null = null;
    try {
      envelope = (await res.json()) as Envelope<T>;
    } catch {
      // Non-JSON response (e.g. a proxy error page).
    }

    if (!res.ok || !envelope?.success) {
      const code = envelope?.error?.code ?? `HTTP_${res.status}`;
      const message = envelope?.error?.message ?? `Request failed with status ${res.status}`;
      throw new HiredApiError(res.status, code, message, envelope?.error?.details);
    }
    return envelope.data as T;
  }

  /** Validate the key and return the partner record + granted scopes. */
  async me(): Promise<{ partner: PartnerInfo; scopes: PartnerScope[] }> {
    return this.request("GET", "/api/partner/v1/me");
  }

  jobSeekers = {
    /** Create a Hired.Video job-seeker account (optionally with a first
     *  resume). Returns a one-time `claimUrl` for the job seeker to log in. */
    create: (input: CreateJobSeekerInput): Promise<CreateJobSeekerResult> =>
      this.request("POST", "/api/partner/v1/job-seekers", input),

    /** Add a resume to a CONNECTED account. Requires an active connection. */
    uploadResume: (userId: string, input: UploadResumeInput): Promise<Record<string, unknown>> =>
      this.request("POST", `/api/partner/v1/job-seekers/${encodeURIComponent(userId)}/resumes`, input),

    /** Read a connected job seeker's live profile + active resume. */
    getProfile: (userId: string): Promise<ProfilePayload> =>
      this.request("GET", `/api/partner/v1/job-seekers/${encodeURIComponent(userId)}/profile`),
  };

  /**
   * Begin connecting an EXISTING Hired.Video account. Returns a `consentUrl`
   * you redirect the job seeker to; access activates only after they approve.
   */
  connect(input: ConnectInput): Promise<ConnectResult> {
    return this.request("POST", "/api/partner/v1/connect", input);
  }

  connections = {
    /** List every job seeker connected to your platform. */
    list: (): Promise<PartnerConnection[]> =>
      this.request<{ connections: PartnerConnection[] }>("GET", "/api/partner/v1/connections").then(
        (d) => d.connections,
      ),

    /** Revoke your access to a connection. */
    revoke: (userId: string): Promise<void> =>
      this.request<{ revoked: boolean }>(
        "DELETE",
        `/api/partner/v1/connections/${encodeURIComponent(userId)}`,
      ).then(() => undefined),
  };

  /**
   * Mint a short-lived embed token for a connected job seeker. Pass the
   * returned `embedUrl` (or `token`) to your frontend to render the profile in
   * an iframe (see the `@hiredvideo/sdk/react` entry or `mountHiredProfile`).
   */
  createEmbedToken(input: CreateEmbedTokenInput): Promise<EmbedToken> {
    return this.request("POST", "/api/partner/v1/embed-tokens", input);
  }
}
