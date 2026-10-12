/**
 * Inbox action engine (L2) — shared contract.
 *
 * Decomposition reminder (PRD §2): L1 = extract/classify (the profile's
 * `classify_prompt` + `extract_schema`); L2 = act/automate (this file).
 * Conflating L2 into the classify prompt is explicitly rejected — actions
 * touch other aggregates (Contacts / JD / pipeline) and MUST be
 * idempotent + audited. An action is `(trigger) → handler(extracted, email)`.
 *
 * These enums are the SSoT for the `inbox_actions.trigger_type` /
 * `inbox_actions.handler` CHECK constraints and the builder UI selects.
 */

/** What causes an action to fire for a classified message. */
export const INBOX_ACTION_TRIGGERS = {
  /** Fire when the message's category equals `trigger_value`. */
  CATEGORY: "category",
  /** Fire when a Stage-1 rule named `trigger_value` matched. */
  RULE: "rule",
  /** Fire for every relevant (visible) message. */
  ALWAYS: "always",
} as const;

export type InboxActionTrigger =
  (typeof INBOX_ACTION_TRIGGERS)[keyof typeof INBOX_ACTION_TRIGGERS];

export const INBOX_ACTION_TRIGGER_VALUES: readonly string[] =
  Object.values(INBOX_ACTION_TRIGGERS);

/** What an action does when it fires. Each handler reuses an existing
 *  aggregate — never re-implemented inside the email service. */
export const INBOX_ACTION_HANDLERS = {
  /** Create an in-app notification (the only handler in #1981 core). */
  NOTIFY: "notify",
  /** Upsert a Contact from the sender (#1982). */
  UPSERT_CONTACT: "upsert_contact",
  /** Associate a candidate reply to candidate/JD in the pipeline (#1982). */
  LINK_TO_PIPELINE: "link_to_pipeline",
  /** Create a sourcing lead from a hiring signal (#1982). */
  CREATE_SOURCING_LEAD: "create_sourcing_lead",
  /** Draft a tailored JD from intake notes (#1982 — bills token ledger). */
  DRAFT_TAILORED_JD: "draft_tailored_jd",
  /** POST the extracted payload to a user webhook (#1982). */
  WEBHOOK: "webhook",
} as const;

export type InboxActionHandler =
  (typeof INBOX_ACTION_HANDLERS)[keyof typeof INBOX_ACTION_HANDLERS];

export const INBOX_ACTION_HANDLER_VALUES: readonly string[] =
  Object.values(INBOX_ACTION_HANDLERS);

/** Audit status for one `(message, action)` run. */
export const INBOX_ACTION_RUN_STATUSES = {
  SUCCESS: "success",
  ERROR: "error",
  SKIPPED: "skipped",
} as const;

export type InboxActionRunStatus =
  (typeof INBOX_ACTION_RUN_STATUSES)[keyof typeof INBOX_ACTION_RUN_STATUSES];

export const INBOX_ACTION_RUN_STATUS_VALUES: readonly string[] =
  Object.values(INBOX_ACTION_RUN_STATUSES);

/** Runtime shape of one configured action. */
export interface InboxActionShape {
  id: string;
  profileId: string;
  ownerId: string | null;
  name: string;
  triggerType: InboxActionTrigger;
  triggerValue: string | null;
  handler: InboxActionHandler;
  config: Record<string, unknown> | null;
  isEnabled: boolean;
  priority: number;
}

/** Does this action's trigger match a classified message? Pure — shared
 *  by the live dispatcher and the dry-run preview so they can't diverge. */
export function actionTriggerMatches(
  action: Pick<InboxActionShape, "triggerType" | "triggerValue">,
  message: { category: string; ruleName?: string | null },
): boolean {
  switch (action.triggerType) {
    case INBOX_ACTION_TRIGGERS.ALWAYS:
      return true;
    case INBOX_ACTION_TRIGGERS.CATEGORY:
      return !!action.triggerValue && action.triggerValue === message.category;
    case INBOX_ACTION_TRIGGERS.RULE:
      return !!action.triggerValue && action.triggerValue === message.ruleName;
    default:
      return false;
  }
}
