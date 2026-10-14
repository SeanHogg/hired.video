# @seanhogg/hired-video-sdk

> **License notice:** This code is source-available, **not** open source. No commercial use except by Sean Hogg. Using it, or any variation of it, requires you to open-source your entire product, and training AI on it requires you to open-source the model (weights, code and datasets). Credit is required. Read [LICENSE](LICENSE) and the [License section](#license--read-before-you-use-this-code) before using any of it.

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

// (b) Plain text — parsed server-side into JSON Resume (same AI pipeline
// as first-party /api/resumes/parse; billed to the job seeker).
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
education) through the same AI parse pipeline as first-party uploads. A JSON
Resume file short-circuits with no model call. **Max decoded size: 10 MB.**

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

## License — read before you use this code

Copyright (C) 2024-2026 Sean Hogg. All rights reserved except as granted in **[LICENSE](LICENSE)** (hired.video Noncommercial Share-Alike License 1.0).

**This is source-available, not open source.** Being able to see this code does not give you permission to use it. Read [LICENSE](LICENSE) in full before you copy, run, modify, deploy or train on any part of it. Doing any of those means you accept its terms. This summary is for convenience only; if it differs from [LICENSE](LICENSE), [LICENSE](LICENSE) controls.

### 1. No commercial use — except by Sean Hogg

Only Sean Hogg may use this software for a commercial purpose. Commercial purposes include:

- any use by, for or on behalf of a company or for-profit organization, including internal business use;
- any use in a product, service, site, app or platform that charges money, sells subscriptions, shows ads, takes fees or commissions, or earns revenue in any way;
- offering it, or any of its features, to others as a hosted, managed, embedded or white-label service;
- competing with any hired.video product or service.

Any other commercial use requires a **separate written license signed by Sean Hogg**.

### 2. Use it, and you must open-source everything

If you distribute this software or **any variation of it**, or let anyone use it over a network (a website, an API, an app backend, an embedded widget), you must publish the **complete source code of your entire product or service** that includes, imports, links to, calls, wraps or runs alongside it. That means all of it, not just the files you changed: back end, front end, database schemas, build and deployment code, and hosting configuration. It must be:

- public and free of charge, available no later than the day you ship or go live, and for at least three years afterward;
- licensed under these same terms, with no extra restrictions;
- clearly signposted to everyone who receives or uses your product.

Ports, translations and rewrites substantially based on this code count as variations.

### 3. AI training: train on it, and you must open-source the model

Using any part of this code to **pre-train, train, fine-tune, distill, evaluate or benchmark an AI model, or as retrieval/RAG/context material for one**, is a use under the license. If you do:

- the resulting model is a Covered Work. You must publish its **complete weights, architecture, configuration, tokenizer, training and inference code, and every dataset that contained this code**, under these same terms;
- the same applies to every model distilled, merged or fine-tuned from it, and to every agent, product or service that runs it;
- AI-generated code or text that reproduces, adapts or is substantially based on this code is also a Covered Work;
- training a model that is offered to anyone else, or used to earn revenue, is a commercial purpose and is **prohibited** without a written license from Sean Hogg.

### 4. Credit is required

- Keep every `Required Notice:` line and every copyright and license notice, unchanged, in every copy and every variation.
- Any product with a user interface must show **"Based on hired.video by Sean Hogg"** with a working link to https://hired.video, somewhere users can reach from every screen (a footer, an About page or a legal-notices page).
- Don't suggest that Sean Hogg or hired.video endorses you. No trademark rights are granted.

### 5. Breaking the terms ends your license immediately

Any violation ends all your rights under the license automatically and without notice. Your source-sharing obligations for anything you already shipped continue. Only Sean Hogg can reinstate a license, in writing.

**Commercial licensing:** contact Sean Hogg via https://hired.video.
