# @seanhogg/hired-video-sdk

Official **Hired.Video** partner SDK. Let your platform create and connect
Hired.Video job-seeker accounts, upload résumés, keep profiles in sync, and
embed a job seeker's profile/résumé UI directly in your product.

Built for platforms like **builderforce.ai** that want to display Hired.Video
talent and hire them in-app.

```bash
npm install @seanhogg/hired-video-sdk
```

## Getting an API key

1. Sign in to Hired.Video, open **Settings → Partner Access**, and
   **request partner access** (account owners only).
2. A Hired.Video admin reviews and approves the request (you'll get an email).
3. Back in **Settings → Partner Access**, **generate an API key** (`hvpk_…`).
   Store it as a server-side secret — it is shown only once and must never
   reach a browser.

## Quick start (server-side)

```ts
import { HiredClient } from "@seanhogg/hired-video-sdk";

const hired = new HiredClient({ apiKey: process.env.HIRED_API_KEY! });

// Create (find-or-create) a Hired.Video job-seeker for one of your users.
const created = await hired.jobSeekers.create({
  email: "jane@example.com",
  name: "Jane Doe",
  externalUserId: "your-user-123",
  resume: { rawText: resumePlainText }, // or { content: jsonResume } or { file }
});
// → { userId, connectionId, status, claimUrl, resumeId, alreadyExisted }
// Send `claimUrl` to the job seeker so they can log in and set a password.

// Read the live, typed profile (skills etc. for prefill).
const { profile, resumeStatus, updatedAt } = await hired.jobSeekers.getProfile(created.userId);
// profile.skills → string[]  (prefill freelancer_profiles.skills)
```

---

# Partner integration reference

Answers to the common integration questions, with the exact request/response
contracts. All types below are shipped in `dist/index.d.ts` — no local mirror
needed.

## 1. Résumé upload — text, JSON, or a file

A résumé can be supplied three ways, in priority order: structured `content`
(JSON Resume), `rawText`, or a `file`.

```ts
// (a) Structured JSON Resume — preferred, no parsing needed.
await hired.jobSeekers.uploadResume(userId, { content: jsonResumeDoc });

// (b) Plain text — parsed server-side (no AI) into JSON Resume.
await hired.jobSeekers.uploadResume(userId, { rawText: extractedText });

// (c) A file — pass a Blob/File/ArrayBuffer/Uint8Array or a base64 string.
await hired.jobSeekers.uploadResume(userId, {
  file: pdfBlob,           // the SDK base64-encodes it for you
  filename: "jane.pdf",
  contentType: "application/pdf",
});
```

**Supported `file` formats:** **PDF**, **DOCX**, `text/plain`, and
`application/json`. PDF and DOCX are extracted to text server-side (PDF via a
text layer, DOCX via its document XML) and then structured (skills / work /
education) with no AI cost. **Max decoded size: 10 MB.**

> **Not supported:** legacy binary `.doc` (OLE), and image/scanned résumés with
> no text layer. These return `HiredApiError.code === "UNSUPPORTED_MEDIA_TYPE"`
> (415) or `INVALID_RESUME` (422) — save as PDF/DOCX or send extracted `rawText`.
> A scanned PDF with no selectable text also returns `INVALID_RESUME`.

On `create`, a `file` that can't be ingested does **not** fail account
creation — you get the account plus `resumeError: { code, message }`, and can
retry `uploadResume` later.

## 2. `getProfile` response schema

`getProfile(userId)` returns a stable, documented shape (`ProfilePayload`):

```ts
{
  user: { id, name, email, handle, headline, location, avatarUrl, videoPitchUrl },
  profile: {                       // ← flat extract for prefill / display
    skills: string[],
    headline: string | null,
    summary: string | null,
    location: string | null,
    experience: Array<{ company, position, startDate, endDate, summary, highlights }>,
    education:  Array<{ institution, area, studyType, startDate, endDate }>,
  },
  resumeStatus: "ready" | "parsing" | "none",
  updatedAt: string | null,        // ISO; also the ETag (see §6)
  resume: Record<string, unknown> | null,   // raw JSON Resume of the active résumé
}
```

Prefill `freelancer_profiles.skills` from `profile.skills` and render from
`profile.experience` / `profile.education`. `profile` is derived from the active
(or master) résumé, so it stays in sync with edits the job seeker makes on
Hired.Video.

## 3. Embed token contract

```ts
const { embedUrl, expiresAt } = await hired.createEmbedToken({
  userId,
  kind: "profile",     // "profile" | "resume"
  theme: "auto",       // "auto" | "light" | "dark"  (optional)
  locale: "en",        // BCP-47 (optional)
});
```

- **(a) TTL & single-use.** Tokens are **HMAC-signed, stateless, and expire 15
  minutes** after minting (`expiresAt` is returned). They are **not single-use**
  — the same `embedUrl` renders until it expires. Mint one per page render.
- **(b) Params.** `kind` is `"profile" | "resume"`. Optional `theme`
  (`auto`/`light`/`dark`) and `locale` are forwarded to the embed page as query
  params. `embedUrl` is `null` when the job seeker has no résumé.
- **(c) Framing / allowed origins.** The embed page is served with
  `Content-Security-Policy: frame-ancestors` restricted to Hired.Video +
  registered partner origins. **Send us the origins to allow-list**
  (`https://builderforce.ai`, `https://*.builderforce.ai`). It works in a
  partitioned/credentialless iframe. Until your origins are registered, the
  frame may be blocked by CSP.
- **(d) Authorization scope.** The token is **viewer-authorization-scoped**: it
  encodes `{partnerId, userId, kind, exp}` and is only accepted for the exact
  `userId` you minted it for, **and only while your connection to that user is
  `active`**. The embed re-checks consent on every load, so a revoked connection
  stops rendering immediately even within the token's lifetime. An employer on
  your platform can safely view a candidate through a token you mint
  server-side — they can only ever see users who consented to your platform, and
  only the visibility the job seeker allows.

Render it:

```tsx
import { HiredProfileEmbed } from "@seanhogg/hired-video-sdk/react";
<HiredProfileEmbed embedUrl={embedUrl} height={800} />;
```

```js
import { mountHiredProfile } from "@seanhogg/hired-video-sdk";
const embed = mountHiredProfile("#hired-profile", { embedUrl }); // embed.destroy() to remove
```

## 4. Claim flow & status semantics

`create` returns `{ status, claimUrl, connectionId, resumeId, alreadyExisted }`.

- **`status`** is the *connection* lifecycle: `"active" | "pending" | "revoked"`.
  A **partner-created** account is `active` immediately (consent is implicit —
  you made the account). A **connect()**-ed existing account is `pending` until
  the job seeker approves.
- **The profile/embed are populated before the user claims.** The account and
  its résumé exist the moment `create` returns `resumeId`; `claimUrl` only lets
  the *person* log in and set a password — it is not a gate on your reads.
- **The "ready" signal** is `getProfile().resumeStatus === "ready"` (or a
  non-null `resumeId`). Show "résumé pending" while `resumeStatus` is `"none"`
  or `"parsing"`.

## 5. Idempotency / find-or-create

`create` is **idempotent on `externalUserId`**. A repeat call (re-registration,
retry, at-least-once webhook) returns the existing account with
`alreadyExisted: true` — it does not error or duplicate the résumé. You can also
reconcile explicitly:

```ts
try {
  const ref = await hired.jobSeekers.getByExternalUserId("your-user-123");
  // → { userId, connectionId, externalUserId, status, source }
} catch (e) {
  if (HiredApiError.is(e) && e.code === "NOT_FOUND") { /* never provisioned */ }
}
```

## 6. Keeping your cache fresh (polling contract)

Signed webhooks (`resume.updated`, `profile.updated`, `account.claimed`) are on
the roadmap. **Until then, poll `getProfile` with the documented cache contract:**

- Every `getProfile` response includes `updatedAt` (ISO) and the endpoint sets a
  matching **`ETag`** header.
- Send `If-None-Match: "<updatedAt>"` and you get a cheap **`304 Not Modified`**
  when nothing changed — refresh your cached extract only when `updatedAt` moves.
- Recommended cadence: on-demand (when an employer views the profile) plus a
  daily reconcile. Reads are edge-cached server-side, so polling is cheap.

## 7. `connect()` → learning the resulting userId

After the hosted consent flow completes, map your `externalUserId` → the
Hired.Video `userId` with **`getByExternalUserId`** (or `connections.list()`
filtered by `externalUserId`). `connect()` itself also returns the `userId` and
`connectionId` up front (status `pending`); the same ids are stable once the
job seeker approves — poll `getByExternalUserId` until `status === "active"`.

## 8. Scopes & error codes

Each method requires one scope on your key:

| method | scope |
| --- | --- |
| `jobSeekers.create` | `write:job_seekers` |
| `jobSeekers.uploadResume` | `write:resumes` |
| `jobSeekers.getProfile` · `createEmbedToken` | `read:profile` |
| `jobSeekers.getByExternalUserId` · `connections.list` | `read:connections` |
| `connect` · `connections.revoke` | `write:connections` |

Missing-scope calls throw `HiredApiError` with code `FORBIDDEN_SCOPE`. Every
error exposes `.status`, `.code` (a `HiredErrorCode`), `.message`, `.details`:

```ts
type HiredErrorCode =
  | "VALIDATION_ERROR"      // 400
  | "UNAUTHORIZED"          // 401 — bad/missing key
  | "FORBIDDEN"             // 403 — no active connection
  | "FORBIDDEN_SCOPE"       // 403 — key lacks the scope
  | "NOT_FOUND"             // 404
  | "EMAIL_EXISTS"          // 409 — use connect() instead
  | "ALREADY_EXISTS"        // idempotent hit — safe to treat as success
  | "UNSUPPORTED_MEDIA_TYPE"// 415 — unsupported file (.doc/image); send PDF/DOCX/rawText
  | "PAYLOAD_TOO_LARGE"     // 413 — file > 10 MB
  | "RATE_LIMITED"          // 429 — reserved (see below)
  | "INVALID_RESUME";       // 422 — file decoded to no usable content
```

```ts
import { HiredApiError } from "@seanhogg/hired-video-sdk";
try {
  await hired.jobSeekers.create({ email, name, externalUserId });
} catch (e) {
  if (HiredApiError.is(e) && e.isAlreadyExists) return; // duplicate → treat as success
  throw e;
}
```

**Rate limits:** there is **no per-key rate limit enforced today**; the
`RATE_LIMITED` code is reserved so your handling is future-proof. Be a good
citizen — cache reads (see §6) and avoid tight loops.

## 9. Types & PII / retention

- **Types.** All inputs/outputs are shipped as accurate `.d.ts` — delete any
  local mirror.
- **Résumé data is PII.** A partner-created account and its résumé are a
  first-class Hired.Video account the job seeker fully owns and can edit or
  delete. **`connections.revoke(userId)`** cuts off *your* access immediately
  (reads/embeds 403 at once) but does **not** delete the person's account or
  résumé — it's their data. The job seeker can revoke your connection themselves
  at any time from their Hired.Video settings, and can delete their account
  outright, which removes the résumé everywhere.

---

## API surface

| method | description |
| --- | --- |
| `me()` | Validate the key; returns the partner + granted scopes. |
| `jobSeekers.create(input)` | Create/find an account (+ optional first résumé). |
| `jobSeekers.uploadResume(userId, input)` | Add a résumé (content / rawText / file). |
| `jobSeekers.getProfile(userId)` | Live profile + typed `profile` extract + `resumeStatus`. |
| `jobSeekers.getByExternalUserId(externalUserId)` | Reconcile your id → Hired.Video account. |
| `connect(input)` | Begin connecting an existing account → `consentUrl`. |
| `connections.list()` | List every connected job seeker. |
| `connections.revoke(userId)` | Drop a connection (cuts off your access). |
| `createEmbedToken(input)` | Mint a short-lived embed token → `embedUrl`. |

## Security notes

- The **API key is server-side only**. Use `createEmbedToken` + the embed token
  for anything that touches the browser.
- Creating an account you don't control still requires the returned `claimUrl`;
  connecting an existing account always requires the job seeker's consent.
- Every connection is revocable by the job seeker.

## License

MIT
