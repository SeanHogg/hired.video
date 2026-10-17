/**
 * Inbox action engine (L2 runtime) — #1981 core (+ #1982 handlers).
 *
 * Separation from L1: the classifier decides WHAT a message is and pulls
 * structured fields; this engine decides what to DO about it in another
 * aggregate. Every handler reuses an existing aggregate (Contacts / JD /
 * pipeline / notifications) — never re-implemented here.
 *
 * Idempotency is enforced at the audit layer: `inbox_action_runs` has a
 * unique (message_id, action_id) index and `recordRuns` inserts ON
 * CONFLICT DO NOTHING, so a re-sync that re-evaluates a message never
 * double-fires a handler's side effect — EXCEPT a side effect that
 * already committed before the audit row landed. Handlers must therefore
 * be self-idempotent too (upsert, not insert) where the target allows.
 *
 * Budget: `dispatchActions` runs in the ingest PASS-B per-message loop.
 * The `notify` handler is pure (it returns a notification payload the
 * caller batch-inserts), adding zero subrequests. Heavier handlers
 * (#1982: webhook fetch, JD-draft LLM call) DO add subrequests and only
 * fire for relevant messages with a matching enabled action.
 */

import type { Repos, InboxActionRow, InboxActionRunInsert } from "../../repositories/index.js";
import type { EmitNotificationInput } from "../notifications/notificationService.js";
import type { NormalisedEmail } from "./providers/types.js";
import type { LLMClient } from "../adapters/llm-client.js";
import {
  actionTriggerMatches,
  INBOX_ACTION_HANDLERS,
  INBOX_ACTION_RUN_STATUSES,
  type InboxProfileShape,
} from "../../../../shared/email-classification/index.js";

/** Everything a handler needs about the message being acted on. */
export interface ActionContext {
  userId: string;
  profile: InboxProfileShape;
  messageId: string;
  email: NormalisedEmail;
  category: string;
  ruleName?: string | null;
  extracted: Record<string, unknown> | null;
  summary: string | null;
}

/** One handler's output: the audit row (always) plus optional side
 *  effects the caller batches (notifications). A handler that performs
 *  its own aggregate write (Phase-4 contact/JD) does so inline and just
 *  stamps `run.targetType`/`run.targetId`. */
export interface ActionEffect {
  run: InboxActionRunInsert;
  notification?: EmitNotificationInput;
}

/** Deps a handler may use. Repos is the full container so Phase-4
 *  handlers can reach contacts / jobs / pipeline without widening this
 *  type per handler. */
export interface ActionEngineDeps {
  repos: Repos;
  llm: LLMClient;
}

type HandlerFn = (
  action: InboxActionRow,
  ctx: ActionContext,
  deps: ActionEngineDeps,
) => Promise<ActionEffect>;

/** Build the common audit-row skeleton for a run. */
function baseRun(
  action: InboxActionRow,
  ctx: ActionContext,
  status: string,
  extra: Partial<InboxActionRunInsert> = {},
): InboxActionRunInsert {
  return {
    userId: ctx.userId,
    messageId: ctx.messageId,
    actionId: action.id,
    profileId: action.profileId,
    handler: action.handler,
    status,
    ...extra,
  } as InboxActionRunInsert;
}

// ── notify (the #1981 core handler) ──────────────────────────────────────────

/** Surface a relevant message as an in-app notification. Pure — returns
 *  the notification payload for the caller to batch-insert. The title can
 *  be templated via `config.title`; otherwise it's a sensible default. */
const notifyHandler: HandlerFn = async (action, ctx) => {
  const config = (action.config ?? {}) as Record<string, unknown>;
  const title =
    typeof config.title === "string" && config.title.trim()
      ? config.title.trim().slice(0, 255)
      : `Inbox: ${action.name}`;
  const message =
    ctx.summary?.trim() ||
    (ctx.email.subject ?? "").trim() ||
    `New ${ctx.category} email`;
  return {
    run: baseRun(action, ctx, INBOX_ACTION_RUN_STATUSES.SUCCESS, {
      targetType: "notification",
      detail: message.slice(0, 500),
    }),
    notification: {
      recipientIds: [ctx.userId],
      type: "inbox_action",
      actor: null,
      title,
      message: message.slice(0, 4000),
      extraData: {
        messageId: ctx.messageId,
        category: ctx.category,
        actionId: action.id,
        extracted: ctx.extracted ?? undefined,
      },
    },
  };
};

/** Handler registry. Phase-4 handlers (upsert_contact, link_to_pipeline,
 *  create_sourcing_lead, draft_tailored_jd, webhook) register here. */
const HANDLERS: Partial<Record<string, HandlerFn>> = {
  [INBOX_ACTION_HANDLERS.NOTIFY]: notifyHandler,
};

/** Register a handler (used by the Phase-4 handlers module so this file
 *  doesn't take a hard dependency on contacts/jobs/pipeline services). */
export function registerInboxActionHandler(handler: string, fn: HandlerFn): void {
  HANDLERS[handler] = fn;
}

/** Run every enabled action whose trigger matches the classified message.
 *  Returns the effects to persist (audit rows + batched notifications).
 *  A handler that throws is recorded as `error` and does not abort the
 *  rest — one bad action must not drop a sync. */
export async function dispatchActions(
  deps: ActionEngineDeps,
  ctx: ActionContext,
  actions: InboxActionRow[],
): Promise<ActionEffect[]> {
  const effects: ActionEffect[] = [];
  for (const action of actions) {
    if (!actionTriggerMatches(action as any, { category: ctx.category, ruleName: ctx.ruleName })) {
      continue;
    }
    const handler = HANDLERS[action.handler];
    if (!handler) {
      effects.push({
        run: baseRun(action, ctx, INBOX_ACTION_RUN_STATUSES.SKIPPED, {
          detail: `Handler "${action.handler}" not available`,
        }),
      });
      continue;
    }
    try {
      effects.push(await handler(action, ctx, deps));
    } catch (err) {
      effects.push({
        run: baseRun(action, ctx, INBOX_ACTION_RUN_STATUSES.ERROR, {
          detail: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        }),
      });
    }
  }
  return effects;
}
