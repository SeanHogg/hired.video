import { HiredApiError, HiredConfigError } from "./errors.js";
import type {
  PartnerInfo,
  PartnerScope,
  CreateJobSeekerInput,
  CreateJobSeekerResult,
  UploadResumeInput,
  ResumeFileSource,
  JobSeekerRef,
  ConnectInput,
  ConnectResult,
  PartnerConnection,
  ProfilePayload,
  CreateEmbedTokenInput,
  EmbedToken,
} from "./types.js";

const DEFAULT_BASE_URL = "https://hired.video";

/** Base64-encode a résumé file source (runtime-agnostic: Node 18+, browser,
 *  Workers — uses `btoa`, no `Buffer`). A string is assumed already base64. */
async function toBase64(source: ResumeFileSource): Promise<string> {
  if (typeof source === "string") return source;
  let bytes: Uint8Array;
  if (source instanceof Uint8Array) bytes = source;
  else if (source instanceof ArrayBuffer) bytes = new Uint8Array(source);
  else if (typeof Blob !== "undefined" && source instanceof Blob)
    bytes = new Uint8Array(await source.arrayBuffer());
  else
    throw new HiredConfigError(
      "Unsupported `file` — pass a Blob, File, ArrayBuffer, Uint8Array, or base64 string.",
    );
  let binary = "";
  const CHUNK = 0x8000; // chunk so String.fromCharCode(...) never blows the stack
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Normalize a résumé input for the wire: encode a non-string `file` to base64. */
async function encodeResumeInput(input: UploadResumeInput): Promise<UploadResumeInput> {
  if (input.file === undefined || typeof input.file === "string") return input;
  return { ...input, file: await toBase64(input.file) };
}

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
     *  resume). Returns a one-time `claimUrl` for the job seeker to log in.
     *  Idempotent on `externalUserId`: a repeat call returns the existing
     *  account with `alreadyExisted: true` instead of erroring. */
    create: async (input: CreateJobSeekerInput): Promise<CreateJobSeekerResult> => {
      const body = input.resume
        ? { ...input, resume: await encodeResumeInput(input.resume) }
        : input;
      return this.request("POST", "/api/partner/v1/job-seekers", body);
    },

    /** Add a resume to a CONNECTED account. Requires an active connection.
     *  Accepts structured `content`, `rawText`, or a `file` (text/JSON). */
    uploadResume: async (
      userId: string,
      input: UploadResumeInput,
    ): Promise<Record<string, unknown>> =>
      this.request(
        "POST",
        `/api/partner/v1/job-seekers/${encodeURIComponent(userId)}/resumes`,
        await encodeResumeInput(input),
      ),

    /** Read a connected job seeker's live profile + active resume + a typed
     *  `profile` extract (skills/experience/education) + `resumeStatus`. */
    getProfile: (userId: string): Promise<ProfilePayload> =>
      this.request("GET", `/api/partner/v1/job-seekers/${encodeURIComponent(userId)}/profile`),

    /** Resolve your own `externalUserId` → the Hired.Video account + connection
     *  status (find-or-reconcile). Throws `NOT_FOUND` if never provisioned. */
    getByExternalUserId: (externalUserId: string): Promise<JobSeekerRef> =>
      this.request(
        "GET",
        `/api/partner/v1/job-seekers/by-external/${encodeURIComponent(externalUserId)}`,
      ),
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
   * an iframe (see the `@seanhogg/hired-video-sdk/react` entry or `mountHiredProfile`).
   */
  createEmbedToken(input: CreateEmbedTokenInput): Promise<EmbedToken> {
    return this.request("POST", "/api/partner/v1/embed-tokens", input);
  }
}
