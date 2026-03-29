# AI CHRO — Implementation Guide

The AI CHRO (Chief Human Resources Officer) is hired.video's embedded AI assistant. It provides role-aware, context-sensitive career, hiring, and workforce guidance to all platform users — job seekers, recruiters, and employers alike.

---

## Architecture Overview

```
User (browser)
  └─ AIChatPanel.tsx          ← Chat UI: sliding panel, history, copy, session tracking
       └─ ai-service.ts       ← Frontend service: sends to /api/ai/chat
            └─ /api/ai/chat   ← Hono route: session management, DB persistence
                 └─ ai.ts     ← callLLMWithMessages() → OpenRouter (Gemini Flash 1.5)
```

**Database tables** (`api/src/db/schema/ai.ts`):
- `ai_chat_sessions` — one row per conversation (title, model, system prompt, userId)
- `ai_chat_messages` — every user and assistant turn, linked to a session
- `ai_usage_records` — token usage per request, used for tier enforcement

---

## Backend API

All routes live under `/api/ai` (`api/src/routes/ai.ts`).

### `POST /api/ai/chat`

Main chat endpoint. Creates or continues a session, calls OpenRouter, persists the exchange.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | `string` | ✅ | The user's latest message |
| `sessionId` | `string` | — | Existing session UUID; omit to start a new session |
| `history` | `array` | — | `[{ role, content }]` for the current in-memory turn buffer |
| `systemPrompt` | `string` | — | Rich system prompt built by the frontend (user role, page context, actions). Falls back to the default CHRO prompt if omitted. |

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "AI response text",
    "sessionId": "uuid",
    "usage": { "promptTokens": 120, "completionTokens": 80, "totalTokens": 200 }
  }
}
```

**Key behaviours:**
- If `sessionId` is provided and exists, the session's `updatedAt` is refreshed so it bubbles to the top of the history list.
- If no `sessionId`, a new session is created; its title is the first 100 characters of the user's message.
- Up to 20 prior messages are fetched from the DB when no `history` array is supplied.
- The OpenRouter call uses a proper multi-turn messages array (`system` + up to 16 history turns + current `user` message), not a concatenated string.
- Free tier: 10 requests/month (enforced by `checkAIUsage` middleware). Pro/Enterprise: unlimited.

### `GET /api/ai/sessions`

Returns the 50 most recent sessions for the authenticated user, ordered by `updatedAt` descending.

```json
[{ "id": "uuid", "title": "...", "model": "...", "isActive": true, "createdAt": "...", "updatedAt": "..." }]
```

### `GET /api/ai/sessions/:id`

Returns a single session with its full message history in chronological order.

### `DELETE /api/ai/sessions/:id`

Deletes a session and all its messages (cascaded).

---

## LLM Service (`api/src/services/ai.ts`)

Two call patterns are available:

### `callLLM(apiKey, options)` — simple single-turn

Takes `systemPrompt` + `userMessage`. Good for feature-specific one-shot calls (resume scoring, salary analysis, etc.).

### `callLLMWithMessages(apiKey, options)` — multi-turn (preferred for chat)

Takes a full `messages: LLMMessage[]` array with `system`, `user`, and `assistant` roles. Used by `/api/ai/chat` to preserve conversation context correctly.

```ts
await callLLMWithMessages(apiKey, {
  model: "google/gemini-flash-1.5",   // default
  temperature: 0.7,
  messages: [
    { role: "system", content: "..." },
    { role: "user",   content: "First message" },
    { role: "assistant", content: "First reply" },
    { role: "user",   content: "Follow-up" },
  ],
  responseFormat: "text",
});
```

Default model: `google/gemini-flash-1.5` via OpenRouter. Configured via `OPENROUTER_API_KEY` in the Cloudflare Worker environment. If the key is absent, the route falls back to keyword-matched mock responses.

---

## Frontend Service (`frontend/lib/services/ai-service.ts`)

### `aiService.sendChatMessage(messages, options?)`

Sends to `/api/ai/chat`. Extracts the `system` message from the array and passes its content as `systemPrompt` in the request body, so the rich context prompt actually reaches OpenRouter.

```ts
const response = await aiService.sendChatMessage(
  [
    { role: "system", content: richSystemPrompt },
    ...conversationHistory,
    { role: "user", content: userInput },
  ],
  { sessionId: currentSessionId ?? undefined }
);
// response.message — AI reply
// response.sessionId — persist this for the next turn
```

Returns `ChatResponseWithSession` which includes `sessionId` alongside `message` and `usage`.

---

## System Prompt Design

The system prompt is assembled in `AIChatPanel.tsx` (`createEnhancedSystemPrompt`) on the frontend and sent with every request. It has three layers:

### 1. Base CHRO persona
Identifies the AI as the AI Chief Human Resources Officer for hired.video. Defines expertise areas (talent acquisition, career development, workforce strategy, HR analytics, employer branding, compliance) and the three audiences it serves.

### 2. User profile context
```
USER PROFILE:
- Name: Jane Smith
- Role: job_seeker
- Plan: free
```
Injected from `useAuth()` and the AI usage state. Lets the AI tailor advice — a recruiter gets sourcing tips; a job seeker gets interview prep.

### 3. Page context
Auto-detected from the current URL via `detectContextFromRoute()`. Examples:
- `/resumes/edit/:id` → resume editing context with ATS optimization instructions
- `/tasks` → task management context with API field requirements for task creation
- `/jobs/:id` → job viewing context with fit analysis guidance

Available platform APIs are listed in the prompt when relevant, so the AI knows what actions are possible.

---

## Chat UI (`frontend/components/AIChatPanel.tsx`)

### Session tracking
- `currentSessionId` state is initialised to `null` (new chat).
- After the first message, the backend returns a `sessionId` which is stored in state.
- Every subsequent message in the same panel session passes `sessionId` back, continuing the same DB session.
- Clicking **New Chat** resets `currentSessionId` to `null`.

### Chat history sidebar
- Toggled by the **History** (clock) icon in the panel header.
- On open, fetches `GET /api/ai/sessions` and renders a list of past chats with title and date.
- Clicking a session calls `GET /api/ai/sessions/:id`, restores all messages into the panel, and sets `currentSessionId`.
- Individual sessions can be deleted with the trash icon (calls `DELETE /api/ai/sessions/:id`).

### Copy button
- Appears on hover over any AI message bubble.
- Calls `navigator.clipboard.writeText()`.
- Shows a checkmark for 2 seconds after copying.

### Auto-send (quick prompts & `?q=` URLs)
- `openAIWithMessage(text)` in `AIContext` stores a `pendingMessage` and opens the panel.
- `AIChatPanel` watches for `pendingMessage` via `useEffect`; when the panel opens with one set, it clears it and calls `handleSendMessage` after a 300 ms paint delay.
- This powers both the **Quick Start Prompts** on the AI Coach page and the `?q=` URL parameter.

### Usage indicator
- Free tier: progress bar showing `used / 10` requests this month.
- At 2 or fewer remaining: amber warning + upgrade link.
- At 0: error state with upgrade CTA.
- Pro/Enterprise: "Unlimited AI Access" badge instead of the progress bar.

### Role-specific welcome messages
Each user role receives a distinct greeting when the panel opens:

| Role | Welcome focus |
|------|---------------|
| Job Seeker | Resume, interviews, salary negotiation |
| Recruiter | Sourcing, job descriptions, structured interviews |
| Employer | Team building, hiring process, compensation |
| Affiliate | Referral growth, earnings optimization |
| Admin / SuperAdmin | Platform management, analytics |

---

## AI Context System (`frontend/lib/ai-context.tsx`)

The `AIProvider` wraps the app and exposes:

| Function | Description |
|----------|-------------|
| `openAIChat()` | Opens the panel |
| `openAIWithMessage(text)` | Opens the panel and auto-sends `text` |
| `openAIWithContext(payload)` | Legacy: opens panel with a context hint |
| `openAIWithPageContext(context)` | Opens panel with a structured page context |
| `clearPendingMessage()` | Called by AIChatPanel after consuming the pending message |
| `setPageContext(context)` | Used by AIChatPanel to push page-level context |
| `closeAIChat()` | Closes and clears all contexts |

---

## AI Coach Page (`frontend/pages/AICoach.tsx`)

Landing page at `/ai-coach`. Key behaviours:

- Auto-opens the AI panel 500 ms after mount (authenticated users only).
- `?q=<text>` in the URL auto-sends the query via `openAIWithMessage`.
- **Quick Start Prompts** grid — clicking any prompt calls `openAIWithMessage(prompt)` which opens the panel and immediately sends the message as the first turn.
- Feature cards, "How It Works" section, and auth overlay for unauthenticated visitors are static marketing content.

---

## Usage Limits & Billing

Enforcement happens at two layers:

1. **Client-side** (`ai-service.ts`): checks `billingService.getMonthlyAIUsage()` before each request. Throws `AIUsageLimitError` immediately if the free limit is exhausted — no network call made.
2. **Server-side** (`checkAIUsage` middleware): reads usage from `ai_usage_records` and returns HTTP 429 if exceeded. Guards against bypassing the client check.

Free tier limit is defined in `shared/pricing` as `FREE_AI_MONTHLY_LIMIT` (currently 10/month).

---

## Adding a New Context Type

1. Add the type to `AIContextType` in `frontend/lib/types/ai-context.ts`.
2. Add a route match in `detectContextFromRoute()` in `AIChatPanel.tsx`.
3. Add a `createXxxContext()` helper in `frontend/lib/utils/ai-context-helpers.ts`.
4. Add the case to `createContextForType()` in `AIChatPanel.tsx`.
5. Optionally add context-specific instructions to `createEnhancedSystemPrompt()` in `AIChatPanel.tsx`.
