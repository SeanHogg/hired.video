# SendPulse Email Integration — Implementation Notes

## Overview

Transactional emails are sent via the **SendPulse SMTP API** using direct `fetch` calls.
The `sendpulse-api` npm package is intentionally NOT used — it depends on `fs.mkdirSync`
to cache OAuth tokens to disk, which throws on Cloudflare Workers (`[unenv] fs.mkdirSync is not implemented yet`).

---

## Authentication

SendPulse uses OAuth2 client credentials. Obtain a token before every send:

```
POST https://api.sendpulse.com/oauth/access_token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "<EMAIL_CLIENTID>",
  "client_secret": "<EMAIL_SECRET>"
}
```

Tokens expire in 3600s. Cache the token **in memory** (module-level variable) and refresh
60s before expiry. Never write tokens to disk — Workers have no real filesystem.

---

## Sending an Email

```
POST https://api.sendpulse.com/smtp/emails
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": {
    "html": "<BASE64 ENCODED HTML>",
    "subject": "...",
    "from": { "name": "...", "email": "..." },
    "to": [{ "email": "..." }]
  }
}
```

### Critical: HTML must be base64 encoded

The `html` field **must** be base64 encoded. Sending raw HTML produces a successful API
response (`{"result":true}`) but the email arrives with an **empty body**. No error is returned.

```ts
const htmlBase64 = Buffer.from(message.html, "utf-8").toString("base64");
```

---

## Cloudflare Workers: Use `waitUntil` for Fire-and-Forget Sends

Do NOT use `void sendEmail()` on Cloudflare Workers. The Worker terminates as soon as
the HTTP response is returned, killing any pending async work mid-flight.

Use `c.executionCtx.waitUntil()` to keep the Worker alive until the email send completes:

```ts
c.executionCtx.waitUntil(
  sendVerificationEmail(user.email, user.name, token).catch((err) =>
    console.error("[route] Failed to send email:", err),
  ),
);
```

---

## Environment Variables

Set via `wrangler secret put` — never in `wrangler.toml` vars:

| Secret           | Description                  |
|------------------|------------------------------|
| `EMAIL_CLIENTID` | SendPulse Client ID          |
| `EMAIL_SECRET`   | SendPulse Client Secret      |
| `EMAIL_FROM`     | From address (var, not secret) |

---

## Failure Modes Encountered

| Symptom | Cause | Fix |
|---|---|---|
| `[unenv] fs.mkdirSync is not implemented` | Used `sendpulse-api` npm package | Replace with direct `fetch` calls |
| Email sent (200 OK) but body is empty | HTML sent as raw string, not base64 | Base64-encode the `html` field |
| Logs show "Fetching new OAuth token" but nothing after | `void` fire-and-forget killed by Worker shutdown | Use `c.executionCtx.waitUntil()` |
| `EMAIL_CLIENTID`/`EMAIL_SECRET` missing | Secrets not set in Cloudflare | Run `wrangler secret put EMAIL_CLIENTID` |
