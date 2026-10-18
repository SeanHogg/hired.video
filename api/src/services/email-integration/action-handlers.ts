/**
 * L2 action handlers (#1982) — each reuses an existing aggregate; none
 * re-implements one. Registered into the action engine's handler registry
 * at import time (see the `import "./action-handlers.js"` in ingest.ts).
 *
 * Implemented against hired.video-local aggregates:
 *   • draft_tailored_jd — JobService.createJob; the JD body is generated
 *     by the LLM client (bills the token ledger via the `inbox_draft_jd`
 *     use case — no per-action SKU, per project_token_pricing).
 *   • webhook           — generic outbound POST of the extracted payload.
 *   • upsert_contact, create_sourcing_lead, link_to_pipeline — the native
 *     contacts graph (services/contacts/, migration 0493): sender or
 *     extracted candidate → `contacts` (deduped + reconciled), pipeline
 *     association → `contact_job_links`.
 */

import { createJob } from "../job/job-write.js";
import {
  INBOX_ACTION_HANDLERS,
  INBOX_ACTION_RUN_STATUSES,
} from "../../../../shared/email-classification/index.js";
import {
  registerInboxActionHandler,
  type ActionContext,
  type ActionEffect,
  type ActionEngineDeps,
} from "./action-engine.js";
import type { InboxActionRow, InboxActionRunInsert } from "../../repositories/inboxActionsRepository.js";
import { upsertContact, type ContactFields, type UpsertContactResult } from "../contacts/upsert.js";
import { canManageJob, linkContactToJob } from "../contacts/pipeline.js";
import { CONTACT_JOB_STAGES, type ContactJobStage } from "../../../../shared/contacts.js";

function run(
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

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ── draft_tailored_jd ────────────────────────────────────────────────────────

/** Draft a tailored JD from recruiter intake notes + the email body, then
 *  persist it as a draft job via JobService. Bills the token ledger
 *  through the LLM client's `inbox_draft_jd` use case. */
async function draftTailoredJd(
  action: InboxActionRow,
  ctx: ActionContext,
  deps: ActionEngineDeps,
): Promise<ActionEffect> {
  const extracted = ctx.extracted ?? {};
  const role = str((extracted as any).role) ?? str(ctx.email.subject) ?? "Untitled role";
  const mustHaves = Array.isArray((extracted as any).mustHaves)
    ? ((extracted as any).mustHaves as unknown[]).filter((x) => typeof x === "string").join("\n- ")
    : "";
  const comp = str((extracted as any).comp);
  const body = (ctx.email.bodyText ?? ctx.email.bodyHtml ?? ctx.email.snippet ?? "").slice(0, 4000);

  const systemPrompt = `You are a recruiter's assistant. Draft a clear, structured job description from the intake notes provided.
Output plain text with sections: Overview, Responsibilities, Requirements, Nice-to-haves. No preamble, no markdown headers beyond the section names.`;
  const userMessage = [
    `Role: ${role}`,
    comp ? `Compensation: ${comp}` : "",
    mustHaves ? `Must-haves:\n- ${mustHaves}` : "",
    `Intake notes / email:\n${body}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await deps.llm.callText("inbox_draft_jd", {
    useCase: "inbox_draft_jd",
    systemPrompt,
    userMessage,
  });
  const description = (result.content ?? "").trim();
  if (!description) {
    return { run: run(action, ctx, INBOX_ACTION_RUN_STATUSES.ERROR, { detail: "LLM returned empty JD" }) };
  }

  const job = await createJob(
    { title: role.slice(0, 240), description },
    ctx.userId,
  );
  return {
    run: run(action, ctx, INBOX_ACTION_RUN_STATUSES.SUCCESS, {
      targetType: "job",
      targetId: job.id,
      detail: `Drafted JD "${role}"`.slice(0, 500),
    }),
  };
}

// ── webhook ──────────────────────────────────────────────────────────────────

/** POST the classified message + extracted fields to a user-configured
 *  webhook URL. Reuses no aggregate — it's a generic egress. */
async function webhook(
  action: InboxActionRow,
  ctx: ActionContext,
): Promise<ActionEffect> {
  const config = (action.config ?? {}) as Record<string, unknown>;
  const url = str(config.url);
  if (!url || !/^https:\/\//i.test(url)) {
    return { run: run(action, ctx, INBOX_ACTION_RUN_STATUSES.ERROR, { detail: "Missing or non-HTTPS webhook url" }) };
  }
  const payload = {
    messageId: ctx.messageId,
    category: ctx.category,
    from: ctx.email.fromEmail,
    subject: ctx.email.subject,
    summary: ctx.summary,
    extracted: ctx.extracted,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const ok = res.ok;
  return {
    run: run(action, ctx, ok ? INBOX_ACTION_RUN_STATUSES.SUCCESS : INBOX_ACTION_RUN_STATUSES.ERROR, {
      targetType: "webhook",
      detail: `POST ${url} → ${res.status}`.slice(0, 500),
    }),
  };
}

// ── Contacts graph handlers (services/contacts/, migration 0493) ──────────────

/** Person fields from the extraction (candidate/lead keys first) falling
 *  back to the sender. */
function personFrom(ctx: ActionContext, prefer: "sender" | "candidate"): ContactFields {
  const x = (ctx.extracted ?? {}) as Record<string, unknown>;
  const sender: ContactFields = { email: ctx.email.fromEmail, fullName: ctx.email.fromName };
  const candidate: ContactFields = {
    email: str(x.candidateEmail) ?? str(x.email),
    fullName: str(x.candidateName) ?? str(x.name),
  };
  const primary = prefer === "candidate" && (candidate.email || candidate.fullName) ? candidate : sender;
  return {
    ...primary,
    company: str(x.company),
    title: str(x.title) ?? str(x.currentTitle),
    phone: str(x.phone),
    linkedinUrl: str(x.linkedinUrl) ?? str(x.linkedin),
  };
}

function contactRun(
  action: InboxActionRow,
  ctx: ActionContext,
  result: UpsertContactResult,
  verb: string,
): InboxActionRunInsert {
  const merge =
    result.reconcile.kind === "merged" ? " (merged duplicate)" :
    result.reconcile.kind === "queued" ? " (possible duplicate queued for review)" : "";
  return run(action, ctx, INBOX_ACTION_RUN_STATUSES.SUCCESS, {
    targetType: "contact",
    targetId: result.contact.id,
    detail: `${verb} ${result.contact.email ?? result.contact.fullName ?? "contact"}${merge}`.slice(0, 500),
  });
}

async function upsertContactHandler(
  action: InboxActionRow,
  ctx: ActionContext,
  deps: ActionEngineDeps,
): Promise<ActionEffect> {
  const person = personFrom(ctx, "sender");
  if (!person.email && !person.fullName) {
    return { run: run(action, ctx, INBOX_ACTION_RUN_STATUSES.SKIPPED, { detail: "No sender email or name" }) };
  }
  const result = await upsertContact(deps.repos, ctx.userId, { ...person, source: "inbox" });
  return { run: contactRun(action, ctx, result, result.created ? "Created contact" : "Updated contact") };
}

async function createSourcingLeadHandler(
  action: InboxActionRow,
  ctx: ActionContext,
  deps: ActionEngineDeps,
): Promise<ActionEffect> {
  const person = personFrom(ctx, "candidate");
  if (!person.email && !person.fullName) {
    return { run: run(action, ctx, INBOX_ACTION_RUN_STATUSES.SKIPPED, { detail: "No lead email or name extracted" }) };
  }
  const result = await upsertContact(deps.repos, ctx.userId, { ...person, source: "sourcing", lifecycle: "lead" });
  return { run: contactRun(action, ctx, result, "Sourcing lead") };
}

/** Upsert the candidate, then put them on the job pipeline. The job comes
 *  from the action config (`jobId`) or the extraction (`jobId`). */
async function linkToPipelineHandler(
  action: InboxActionRow,
  ctx: ActionContext,
  deps: ActionEngineDeps,
): Promise<ActionEffect> {
  const config = (action.config ?? {}) as Record<string, unknown>;
  const jobId = str(config.jobId) ?? str((ctx.extracted as Record<string, unknown> | null)?.jobId);
  if (!jobId) {
    return { run: run(action, ctx, INBOX_ACTION_RUN_STATUSES.SKIPPED, { detail: "No jobId in the action config or extraction" }) };
  }
  const person = personFrom(ctx, "candidate");
  if (!person.email && !person.fullName) {
    return { run: run(action, ctx, INBOX_ACTION_RUN_STATUSES.SKIPPED, { detail: "No candidate email or name" }) };
  }
  const upserted = await upsertContact(deps.repos, ctx.userId, { ...person, source: "inbox" });
  const stage = str(config.stage);
  const linked = await linkContactToJob(
    { contacts: deps.repos.contacts, canManageJob },
    ctx.userId,
    upserted.contact.id,
    jobId,
    stage && (CONTACT_JOB_STAGES as readonly string[]).includes(stage) ? (stage as ContactJobStage) : "replied",
  );
  if ("reason" in linked) {
    return { run: run(action, ctx, INBOX_ACTION_RUN_STATUSES.ERROR, { targetType: "contact", targetId: upserted.contact.id, detail: `Can't link to job ${jobId}: ${linked.reason}` }) };
  }
  return {
    run: run(action, ctx, INBOX_ACTION_RUN_STATUSES.SUCCESS, {
      targetType: "contact_job_link",
      targetId: linked.link.id,
      detail: `Linked ${upserted.contact.email ?? upserted.contact.fullName} to job ${jobId} (${linked.link.stage})`.slice(0, 500),
    }),
  };
}

registerInboxActionHandler(INBOX_ACTION_HANDLERS.DRAFT_TAILORED_JD, draftTailoredJd);
registerInboxActionHandler(INBOX_ACTION_HANDLERS.WEBHOOK, webhook);
registerInboxActionHandler(INBOX_ACTION_HANDLERS.UPSERT_CONTACT, upsertContactHandler);
registerInboxActionHandler(INBOX_ACTION_HANDLERS.CREATE_SOURCING_LEAD, createSourcingLeadHandler);
registerInboxActionHandler(INBOX_ACTION_HANDLERS.LINK_TO_PIPELINE, linkToPipelineHandler);
