# @seanhogg/hired-video-sdk

Official **Hired.Video** partner SDK. Let your platform create and connect
Hired.Video job-seeker accounts, upload resumes, keep profiles in sync, and
embed a job seeker's profile/resume UI directly in your product.

Built for platforms like **builderforce.ai** that want to display Hired.Video
talent and hire them in-app.

```bash
npm install @seanhogg/hired-video-sdk
```

## Getting an API key

1. Sign in to Hired.Video, open **Settings → Partner Access**, and
   **request partner access** (account owners only).
2. A Hired.Video admin reviews and approves the request (you'll get an email).
3. Back in **Settings → Partner Access**, **generate an API key**
   (`hvpk_…`). Store it as a server-side secret — it is shown only once and
   must never reach a browser.

## Quick start (server-side)

```ts
import { HiredClient } from "@seanhogg/hired-video-sdk";

const hired = new HiredClient({ apiKey: process.env.HIRED_API_KEY! });

// 1. Create a Hired.Video job-seeker account for one of your users.
const created = await hired.jobSeekers.create({
  email: "jane@example.com",
  name: "Jane Doe",
  externalUserId: "your-user-123",
  resume: { rawText: resumePlainText }, // or { content: jsonResume }
});
// → { userId, connectionId, status, claimUrl, resumeId }
// Send `claimUrl` to the job seeker so they can log in and set a password.

// 2. Add another resume later.
await hired.jobSeekers.uploadResume(created.userId, {
  title: "Senior Engineer resume",
  content: jsonResumeDocument,
});

// 3. Read the live profile (reflects edits the job seeker makes on Hired.Video).
const profile = await hired.jobSeekers.getProfile(created.userId);
```

## Connecting an existing Hired.Video account

If the person already has a Hired.Video account, you can't take it over —
the **job seeker must consent**. Start the flow and redirect them to the
returned hosted consent screen:

```ts
const { consentUrl } = await hired.connect({
  email: "existing@example.com",
  externalUserId: "your-user-456",
  redirectUrl: "https://your-app.com/after-connect",
});
// Redirect the job seeker to `consentUrl`. Once they approve, the connection
// becomes active and you can read/embed their profile.
```

The job seeker can review and revoke any connection at any time from their
Hired.Video settings.

## Embedding a profile / resume

Never expose your API key to the browser. Mint a **short-lived embed token**
server-side, hand it to your frontend, and render an iframe.

**Server:**

```ts
const { embedUrl } = await hired.createEmbedToken({
  userId,
  kind: "profile", // or "resume"
});
// Pass `embedUrl` to your frontend. It renders the job seeker's resume via
// Hired.Video's canonical embed page with a short-lived token attached.
```

**React:**

```tsx
import { HiredProfileEmbed } from "@seanhogg/hired-video-sdk/react";

<HiredProfileEmbed embedUrl={embedUrl} height={800} />;
```

**Anywhere (vanilla JS):**

```js
import { mountHiredProfile } from "@seanhogg/hired-video-sdk";

const embed = mountHiredProfile("#hired-profile", { embedUrl });
// embed.destroy() to remove it
```

The embed re-checks consent on every load, so a revoked connection stops
rendering immediately even within a token's lifetime. `embedUrl` is `null`
if the job seeker has no resume yet.

## API

### `new HiredClient({ apiKey, baseUrl?, fetch? })`

| method | description |
| --- | --- |
| `me()` | Validate the key; returns the partner + granted scopes. |
| `jobSeekers.create(input)` | Create an account (+ optional first resume). |
| `jobSeekers.uploadResume(userId, input)` | Add a resume to a connected account. |
| `jobSeekers.getProfile(userId)` | Read the live profile + active resume. |
| `connect(input)` | Begin connecting an existing account → `consentUrl`. |
| `connections.list()` | List every connected job seeker. |
| `connections.revoke(userId)` | Drop a connection. |
| `createEmbedToken(input)` | Mint a short-lived embed token. |

All methods return the payload directly and throw `HiredApiError`
(`.status`, `.code`, `.message`) on failure.

### Scopes

A key is granted a subset of: `write:job_seekers`, `write:resumes`,
`read:profile`, `write:connections`, `read:connections`. Calls missing a
required scope throw `HiredApiError` with code `FORBIDDEN_SCOPE`.

## Security notes

- The **API key is server-side only**. Use `createEmbedToken` + the embed
  token for anything that touches the browser.
- Creating an account you don't control requires the returned `claimUrl`;
  connecting an existing account always requires the job seeker's consent.
- Every connection is revocable by the job seeker.

## License

MIT
