# SendPulse Email Integration — Technical Reference

> Template/reference for reuse across products. Based on the working hired.video implementation.

---

## Overview

**Purpose:** Transactional email delivery only (verification, password reset, 2FA, magic links, follow-up sequences). SendPulse is NOT used for contact/list management — all subscriber state is stored locally.

**Stack:** Cloudflare Worker (Hono) · Drizzle ORM · Neon PostgreSQL · SendPulse REST API (raw `fetch`, not the npm package)

**Why not the npm package:** `sendpulse-api` depends on `fs.mkdirSync` to cache tokens to disk, which throws on Cloudflare Workers (`[unenv] fs.mkdirSync is not implemented yet`). Use direct `fetch` calls instead.

---

## 1. Dependencies

```json
// package.json
"sendpulse-api": "^1.1.7"  // declared but unused — raw fetch is used instead
```

Do NOT use the `sendpulse-api` npm wrapper. Use direct `fetch()` to the REST API for Cloudflare Worker compatibility.

---

## 2. Environment Variables

| Variable | Required | Where Set | Purpose |
|---|---|---|---|
| `EMAIL_CLIENTID` | Yes | Wrangler secret | SendPulse OAuth Client ID |
| `EMAIL_SECRET` | Yes | Wrangler secret | SendPulse OAuth Client Secret |
| `EMAIL_FROM` | No | `wrangler.toml` vars | From address (default: `info@yourproduct.com`) |
| `FRONTEND_URL` | Yes | `wrangler.toml` vars | Base URL for link generation |

```toml
# wrangler.toml
[vars]
EMAIL_FROM = "info@yourproduct.com"
FRONTEND_URL = "https://yourproduct.com"

# Secrets (set via: wrangler secret put EMAIL_CLIENTID)
# EMAIL_CLIENTID
# EMAIL_SECRET
```

---

## 3. Authentication

SendPulse uses OAuth 2.0 Client Credentials. Obtain a token before every send:

```
POST https://api.sendpulse.com/oauth/access_token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "<EMAIL_CLIENTID>",
  "client_secret": "<EMAIL_SECRET>"
}
```

Tokens expire in 3600s. Cache the token **in memory** (module-level variable) and refresh 60s before expiry. Never write tokens to disk — Workers have no real filesystem.

```typescript
let _cachedToken: string | null = null;
let _tokenExpiresAt: number = 0;

async function getSendPulseToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now() / 1000;
  if (_cachedToken && now < _tokenExpiresAt - 60) return _cachedToken;

  const res = await fetch('https://api.sendpulse.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) throw new Error(`SendPulse auth failed: ${res.status}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  _cachedToken = data.access_token;
  _tokenExpiresAt = now + data.expires_in;
  return _cachedToken;
}
```

---

## 4. Sending an Email

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

The `html` field **must** be base64 encoded. Sending raw HTML produces a successful API response (`{"result":true}`) but the email arrives with an **empty body**. No error is returned.

```typescript
// Safe for UTF-8 content:
const htmlBase64 = btoa(unescape(encodeURIComponent(html)));
```

### Provider Implementation

```typescript
interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  fromEmail?: string;
}

interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

class SendPulseEmailProvider implements EmailProvider {
  constructor(private clientId: string, private clientSecret: string, private fromEmail: string) {}

  async send(message: EmailMessage): Promise<void> {
    const token = await getSendPulseToken(this.clientId, this.clientSecret);

    const payload = {
      email: {
        html: btoa(unescape(encodeURIComponent(message.html))),
        text: '',
        subject: message.subject,
        from: {
          name: message.fromName ?? 'Your Product',
          email: message.fromEmail ?? this.fromEmail,
        },
        to: [{ name: message.to, email: message.to }],
      },
    };

    const res = await fetch('https://api.sendpulse.com/smtp/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    console.log(`[email:sendpulse] send status: ${res.status}`);
  }
}

function getEmailProvider(): EmailProvider | null {
  const clientId = getEnv('EMAIL_CLIENTID');
  const clientSecret = getEnv('EMAIL_SECRET');
  const fromEmail = getEnv('EMAIL_FROM') ?? 'info@yourproduct.com';

  if (!clientId || !clientSecret) {
    console.warn('[email] Missing SendPulse credentials — email disabled');
    return null;
  }

  return new SendPulseEmailProvider(clientId, clientSecret, fromEmail);
}
```

Returns `null` if credentials are missing — graceful degradation, not a crash.

---

## 5. Cloudflare Workers: Use `waitUntil` for Fire-and-Forget Sends

Do NOT use `void sendEmail()` on Cloudflare Workers. The Worker terminates as soon as the HTTP response is returned, killing any pending async work mid-flight.

Use `c.executionCtx.waitUntil()` to keep the Worker alive until the email send completes:

```typescript
c.executionCtx.waitUntil(
  sendVerificationEmail(user.email, user.name, token).catch((err) =>
    console.error('[route] Failed to send email:', err),
  ),
);
```

---

## 6. Template System

Templates are pure TypeScript strings — no external template engine.

### Variable Substitution

```typescript
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render(body: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.replaceAll(`{{${key}}}`, escapeHtml(val)),
    body
  );
}
```

### Template Structure

Each email: `HEADER` + body content + `FOOTER`. All styles are inline for email client compatibility.

```typescript
const HEADER = `
<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1a1a2e; padding: 30px; text-align: center; }
    .content { padding: 40px 30px; }
    .button { display: inline-block; background: #6366f1; color: #ffffff;
              padding: 14px 28px; border-radius: 6px; text-decoration: none; }
    .footer { background: #f8f8f8; padding: 20px; text-align: center;
              font-size: 12px; color: #999; }
  </style>
</head><body><div class="container">
  <div class="header"><img src="{{LogoUrl}}" alt="{{ProductName}}" height="40"></div>
  <div class="content">`;

const FOOTER = `
  </div>
  <div class="footer">
    <p>© {{Year}} {{ProductName}}. All rights reserved.</p>
    <p><a href="{{PreferencesUrl}}">Manage email preferences</a></p>
  </div>
</div></body></html>`;
```

### Template Variables

| Variable | Used In | Source |
|---|---|---|
| `{{RecipientName}}` | All | User record |
| `{{VerifyUrl}}` | Verification | `FRONTEND_URL + /verify-email?token=` |
| `{{ResetUrl}}` | Password reset | `FRONTEND_URL + /reset-password?token=` |
| `{{TwoFactorCode}}` | 2FA | Generated 6-digit code |
| `{{MagicUrl}}` | Magic link | `FRONTEND_URL + /magic?token=` |
| `{{CodeExpiryMinutes}}` | 2FA | Token TTL in minutes |
| `{{Year}}` | Footer | `new Date().getFullYear()` |

### URL Builders

```typescript
function getBaseUrl(): string {
  return getEnv('FRONTEND_URL') ?? 'http://localhost:3000';
}

function buildVerifyUrl(token: string): string {
  return `${getBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

function buildPasswordResetUrl(token: string): string {
  return `${getBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}
```

---

## 7. Transactional Email Functions

All functions follow the same pattern: get provider → render template → send.

```typescript
export async function sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const html = render(HEADER + VERIFY_EMAIL_BODY + FOOTER, {
    Subject: 'Verify your email',
    RecipientName: name,
    VerifyUrl: buildVerifyUrl(token),
    Year: String(new Date().getFullYear()),
  });
  await provider.send({ to, subject: 'Verify your email address', html });
}
```

**Function inventory:**
- `sendVerificationEmail(to, name, token)`
- `sendResendVerificationEmail(to, name, token)`
- `sendPasswordResetEmail(to, name, token)`
- `sendTwoFactorEmail(to, name, code, expiryMinutes)`
- `sendMagicLinkEmail(to, name, token)`

---

## 8. Integration Points — Auth Routes

```typescript
// POST /register
ctx.waitUntil(sendVerificationEmail(email, name, verifyToken));
ctx.waitUntil(triggerOnboardingDrip(userId, email, name, role));

// POST /login (when MFA enabled)
ctx.waitUntil(sendTwoFactorEmail(email, name, code, 10));

// POST /forgot-password
ctx.waitUntil(sendPasswordResetEmail(email, name, resetToken));

// POST /resend-email-verification
ctx.waitUntil(sendResendVerificationEmail(email, name, newToken));

// POST /magic-link
ctx.waitUntil(sendMagicLinkEmail(email, name, magicToken));
```

---

## 9. Token Storage Schema (Drizzle ORM)

```typescript
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const twoFactorCodes = pgTable('two_factor_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false),
  redirect: text('redirect'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

## 10. Follow-up Sequence System (Local Automation)

SendPulse is NOT used for automation. Sequences are processed locally via a cron job.

### Schema

```typescript
export const followUpSequences = pgTable('follow_up_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const followUpSteps = pgTable('follow_up_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequenceId: uuid('sequence_id').references(() => followUpSequences.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull(),
  delayDays: integer('delay_days').default(0),
  subject: text('subject').notNull(),
  bodyTemplate: text('body_template').notNull(), // supports {{name}}, {{company}}, {{custom_vars}}
  channel: text('channel').default('email'),     // 'email' | 'message'
});

export const followUpEnrollments = pgTable('follow_up_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequenceId: uuid('sequence_id').references(() => followUpSequences.id),
  userId: uuid('user_id').references(() => users.id),
  recipientEmail: text('recipient_email').notNull(),
  recipientName: text('recipient_name'),
  recipientUserId: uuid('recipient_user_id'),
  context: jsonb('context'),               // arbitrary vars for template substitution
  status: text('status').default('active'), // 'active' | 'paused' | 'completed' | 'unsubscribed'
  currentStep: integer('current_step').default(0),
  nextSendAt: timestamp('next_send_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const followUpLogs = pgTable('follow_up_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').references(() => followUpEnrollments.id),
  stepId: uuid('step_id').references(() => followUpSteps.id),
  sentAt: timestamp('sent_at').defaultNow(),
  status: text('status').notNull(), // 'sent' | 'failed'
  errorMessage: text('error_message'),
});
```

### Onboarding Drip

Called on registration (fire-and-forget). Auto-creates a system `__onboarding__` sequence if it doesn't exist, then enrolls the new user.

```typescript
// api/src/lib/onboardingDrip.ts
export async function triggerOnboardingDrip(
  userId: string, email: string, name: string, role: string
): Promise<void> {
  // 1. Look up or create system "__onboarding__" sequence
  // 2. If no steps exist, seed 3 defaults:
  //    - Day 0: "Welcome to <product>"
  //    - Day 3: "Your first matches are waiting"
  //    - Day 7: "Unlock AI features"
  // 3. Enroll user with context: { name, email, role }, nextSendAt = now
}
```

### Cron Processor

```typescript
// api/src/scheduled.ts — runs every 5 minutes
export async function processFollowUps(env: Env): Promise<void> {
  // 1. SELECT enrollments WHERE status='active' AND nextSendAt <= NOW()
  // 2. For each:
  //    a. Fetch step at currentStep index
  //    b. If no step → mark completed
  //    c. Substitute context vars into bodyTemplate
  //    d. Call provider.send()
  //    e. Log to followUpLogs (sent|failed)
  //    f. Advance currentStep++, set nextSendAt += nextStep.delayDays
  //    g. If no next step → mark completed
}
```

```toml
# wrangler.toml
[[triggers]]
crons = ["*/5 * * * *"]
```

```typescript
// api/src/worker.ts
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processFollowUps(env));
    ctx.waitUntil(processJobQueue(env));
  }
}
```

---

## 11. Email Preferences

### Schema

```typescript
export const accountPreferences = pgTable('account_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  emailNotificationsEnabled: boolean('email_notifications_enabled').default(true),
  marketingEmailsEnabled: boolean('marketing_emails_enabled').default(false),
  jobAlertEmailsEnabled: boolean('job_alert_emails_enabled').default(true),
  weeklyDigestEnabled: boolean('weekly_digest_enabled').default(false),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

UI: checkbox toggles in account settings → `PATCH /api/account/preferences`.

---

## 12. Error Handling Patterns

```typescript
// Pattern 1: Null provider (missing credentials) — graceful no-op
const provider = getEmailProvider();
if (!provider) {
  console.warn('[email] Provider not configured, skipping send');
  return;
}

// Pattern 2: Send failure — log, don't throw (fire-and-forget contexts)
try {
  await provider.send(message);
} catch (err) {
  console.error('[email:sendpulse] Error sending:', err);
}

// Pattern 3: Auth failure — does throw (caught by caller or waitUntil .catch())
if (!res.ok) throw new Error(`SendPulse auth failed: ${res.status}`);
```

---

## 13. Known Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| `[unenv] fs.mkdirSync is not implemented` | Used `sendpulse-api` npm package | Replace with direct `fetch` calls |
| Email sent (200 OK) but body is empty | HTML sent as raw string, not base64 | `btoa(unescape(encodeURIComponent(html)))` |
| Logs show "Fetching new OAuth token" but nothing after | `void` fire-and-forget killed by Worker shutdown | Use `c.executionCtx.waitUntil()` |
| `EMAIL_CLIENTID`/`EMAIL_SECRET` missing | Secrets not set in Cloudflare | Run `wrangler secret put EMAIL_CLIENTID` |

---

## 14. What Is NOT Implemented (Deliberate)

- SendPulse AddressBook API — contacts stored locally only
- SendPulse webhooks — no bounce/click/open tracking callbacks
- SendPulse native automation flows — local cron replaces this
- SendPulse template sync — templates defined in code
- SendPulse SMS

---

## 15. New Product Checklist

- [ ] Create SendPulse account → get Client ID + Secret
- [ ] `wrangler secret put EMAIL_CLIENTID`
- [ ] `wrangler secret put EMAIL_SECRET`
- [ ] Set `EMAIL_FROM` in `wrangler.toml` vars
- [ ] Copy `services/email.ts` — update branding (logo URL, product name, colors)
- [ ] Copy token tables from `db/schema/users.ts` + run migration
- [ ] Copy `db/schema/followups.ts` + run migration
- [ ] Wire `sendVerificationEmail` into `/register` with `ctx.waitUntil()`
- [ ] Wire `sendPasswordResetEmail` into `/forgot-password`
- [ ] Add `[[triggers]] crons = ["*/5 * * * *"]` to `wrangler.toml`
- [ ] Copy `scheduled.ts`, export `scheduled` from `worker.ts`
- [ ] Copy `lib/onboardingDrip.ts` — update step content for new product
- [ ] Test token flow end-to-end in staging before prod deploy
