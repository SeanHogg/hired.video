/**
 * Workflow action delivery (#1843). The People-Ops workflow engine
 * (routes/people-cadence.ts) used to RECORD notify/slack/email actions
 * without delivering them. This module is the single seam that actually
 * delivers each action over a real channel:
 *
 *   • notify / send_notification / escalate → `emitNotification` (in-app, the
 *     same canonical path as People-Ops events #1824)
 *   • send_email                            → the existing mail provider
 *   • slack_message                         → the company's Slack incoming
 *     webhook stored on `company_integrations(provider='slack')`
 *   • create_task / create_meeting          → handled by the engine itself
 *
 * Best-effort by contract: a delivery failure is returned as `delivered:false`
 * with a detail string and never throws, so one failing action can't abort the
 * whole workflow run.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { emitNotification, resolveActor } from "../notifications/notificationService.js";
import { getEmailProvider } from "../adapters/email/transport.js";
import { escapeHtml } from "../../../../shared/html-escape.js";
import {
  PeopleEmployeesRepository,
  type SegmentScope,
} from "../../repositories/peopleEmployeesRepository.js";

export interface WorkflowAction {
  type: string;
  config: Record<string, unknown>;
  order: number;
}

export interface WorkflowDeliveryCtx {
  tenantId: string;
  segmentId: string;
  companyId: string;
  actorUserId: string;
  workflowName: string;
}

export interface WorkflowDeliveryResult {
  action: string;
  ok: boolean;
  detail: string;
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Resolve `config.recipientUserIds` + `config.recipientEmployeeIds` (roster
 *  ids → linked platform user ids) into a distinct recipient set. */
async function resolveRecipients(
  config: Record<string, unknown>,
  scope: SegmentScope,
): Promise<string[]> {
  const direct = strArr(config.recipientUserIds);
  const employeeIds = strArr(config.recipientEmployeeIds);
  const out = new Set(direct);
  if (employeeIds.length > 0) {
    const repo = new PeopleEmployeesRepository(getDb());
    // ONE inArray lookup (was a findById per employee); keep input order.
    const rows = await repo.findManyByIds(scope, employeeIds);
    const userIdByEmployee = new Map(rows.map((r) => [r.id, r.userId]));
    for (const id of employeeIds) {
      const userId = userIdByEmployee.get(id);
      if (userId) out.add(userId);
    }
  }
  return [...out];
}

export async function deliverWorkflowAction(
  action: WorkflowAction,
  ctx: WorkflowDeliveryCtx,
): Promise<WorkflowDeliveryResult> {
  const scope: SegmentScope = { tenantId: ctx.tenantId, segmentId: ctx.segmentId };
  const title = str(action.config.title) || `${ctx.workflowName}`;
  const message = str(action.config.message) || title;

  try {
    switch (action.type) {
      case "notify":
      case "send_notification":
      case "escalate": {
        const recipientIds = await resolveRecipients(action.config, scope);
        if (recipientIds.length === 0) {
          return { action: action.type, ok: false, detail: "no recipients resolved" };
        }
        const repos = buildRepos(getDb());
        const { actor } = await resolveActor({ repos }, ctx.actorUserId);
        await emitNotification(
          { repos },
          {
            recipientIds,
            type: action.type === "escalate" ? "people_workflow_escalation" : "people_workflow_notification",
            actor,
            title,
            message,
            extraData: { workflow: ctx.workflowName, companyId: ctx.companyId },
          },
        );
        return { action: action.type, ok: true, detail: `notified ${recipientIds.length} recipient(s)` };
      }

      case "send_email": {
        const to = str(action.config.to);
        if (!to) return { action: action.type, ok: false, detail: "no `to` address" };
        const provider = getEmailProvider();
        if (!provider) return { action: action.type, ok: false, detail: "no email provider configured" };
        await provider.send({
          to,
          subject: title,
          html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">${escapeHtml(message)}</div>`,
        });
        return { action: action.type, ok: true, detail: `emailed ${to}` };
      }

      case "slack_message": {
        const webhookUrl = await resolveSlackWebhook(ctx.companyId);
        if (!webhookUrl) {
          return { action: action.type, ok: false, detail: "no connected Slack integration" };
        }
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: `*${title}*\n${message}` }),
        });
        return res.ok
          ? { action: action.type, ok: true, detail: "posted to Slack" }
          : { action: action.type, ok: false, detail: `Slack returned ${res.status}` };
      }

      default:
        // create_meeting + any unknown type — recorded, not delivered here.
        return { action: action.type, ok: true, detail: "recorded (no delivery channel)" };
    }
  } catch (err) {
    return {
      action: action.type,
      ok: false,
      detail: err instanceof Error ? err.message : "delivery error",
    };
  }
}

/** Slack incoming-webhook URL for a company, stored on the connected
 *  `company_integrations(provider='slack')` row's metadata. */
async function resolveSlackWebhook(companyId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ metadata: schema.companyIntegrations.metadata, status: schema.companyIntegrations.status })
    .from(schema.companyIntegrations)
    .where(
      and(
        eq(schema.companyIntegrations.companyId, companyId),
        eq(schema.companyIntegrations.provider, "slack"),
      ),
    )
    .limit(1);
  if (!row || row.status !== "connected") return null;
  const url = (row.metadata as any)?.webhookUrl;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}
