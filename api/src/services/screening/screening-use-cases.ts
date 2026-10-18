/**
 * Screening use cases — the HTTP-free orchestration behind /api/recruit/screening
 * and the public candidate portal: company authorization, template/request
 * lifecycle calls, and best-effort invitation delivery + send-stamp.
 *
 * Every failure is a DomainError carrying the endpoint's historical
 * code/message/status, rendered by the global error handler.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { resolveCompanyScope, userCanAccessCompany } from "../company/scope.js";
import { sendScreeningInvitationEmail } from "../adapters/email.js";
import {
  findScreeningRequestById,
  listScreeningRequestItems,
  stampScreeningRequestSent,
} from "../../repositories/screeningRequestsRepository.js";
import {
  archiveTemplate,
  createTemplate,
  getTemplateWithItems,
  listTemplates,
  updateTemplate,
  type TemplateInput,
} from "./template-service.js";
import {
  claimRequest,
  createScreeningRequest,
  getRequestByToken,
  listRequests,
  resolveApplicationForScreening,
  satisfyRequestItem,
  type CreateRequestArgs,
  type RequestWithItems,
} from "./request-service.js";

const forbidden = () => new DomainError(403, "FORBIDDEN", "Access denied");
const templateNotFound = () => new DomainError(404, "NOT_FOUND", "Template not found");
const requestNotFound = () => new DomainError(404, "NOT_FOUND", "Request not found");
const linkUnavailable = () => new DomainError(404, "NOT_FOUND", "This screening link is no longer available");

async function assertCompanyAccess(userId: string, companyId: string): Promise<void> {
  if (!(await userCanAccessCompany(userId, companyId))) throw forbidden();
}

/** Company ids to list for: the caller's scope, narrowed to `filter` when given
 *  (403 when the filter is outside the scope). Empty → nothing to list. */
async function scopedCompanyIds(userId: string, filter: string | undefined): Promise<string[]> {
  const scope = await resolveCompanyScope(userId, filter);
  if (scope.companyIds.length === 0) return [];
  if (filter && !scope.companyIds.includes(filter)) throw forbidden();
  return filter ? [filter] : scope.companyIds;
}

/** Template writes surface any item-validation failure as a 400. */
async function asTemplateValidation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw new DomainError(400, "VALIDATION_ERROR", e instanceof Error ? e.message : "Invalid item");
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function listScreeningTemplates(userId: string, filter: string | undefined) {
  const companyIds = await scopedCompanyIds(userId, filter);
  if (companyIds.length === 0) return [];
  return listTemplates(getDb(), companyIds);
}

export async function getScreeningTemplate(userId: string, templateId: string) {
  const loaded = await getTemplateWithItems(getDb(), templateId);
  if (!loaded) throw templateNotFound();
  await assertCompanyAccess(userId, loaded.template.companyId);
  return loaded;
}

export async function createScreeningTemplate(userId: string, input: { companyId: string } & TemplateInput) {
  await assertCompanyAccess(userId, input.companyId);
  return asTemplateValidation(() => createTemplate(getDb(), { ...input, createdByUserId: userId }));
}

export async function updateScreeningTemplate(
  userId: string,
  templateId: string,
  patch: Parameters<typeof updateTemplate>[2],
) {
  await getScreeningTemplate(userId, templateId);
  return asTemplateValidation(() => updateTemplate(getDb(), templateId, patch));
}

export async function archiveScreeningTemplate(userId: string, templateId: string): Promise<void> {
  await getScreeningTemplate(userId, templateId);
  await archiveTemplate(getDb(), templateId);
}

// ── Requests ─────────────────────────────────────────────────────────────────

export async function listScreeningRequests(userId: string, filter: string | undefined) {
  const companyIds = await scopedCompanyIds(userId, filter);
  if (companyIds.length === 0) return [];
  return listRequests(getDb(), companyIds);
}

async function loadAccessibleRequest(userId: string, requestId: string) {
  const request = await findScreeningRequestById(getDb(), requestId);
  if (!request) throw requestNotFound();
  await assertCompanyAccess(userId, request.companyId);
  return request;
}

export async function getScreeningRequest(userId: string, requestId: string) {
  const request = await loadAccessibleRequest(userId, requestId);
  const items = await listScreeningRequestItems(getDb(), request.id);
  return { request, items };
}

/**
 * Best-effort invite send + stamp. A send failure must NOT roll back the row —
 * the recruiter can always resend (mirrors the account-invite pattern).
 * `resendCount` is set for the resend path only.
 */
async function deliverInvitation(
  request: RequestWithItems["request"],
  opts?: { incrementResend?: boolean },
) {
  await sendScreeningInvitationEmail({
    to: request.candidateEmail,
    candidateName: request.candidateName,
    token: request.token,
    message: request.message,
  }).catch(() => undefined);
  return stampScreeningRequestSent(
    getDb(),
    request.id,
    new Date(),
    opts?.incrementResend ? (request.resendCount ?? 0) + 1 : undefined,
  );
}

/** Create a request from a template and send the invitation. */
export async function sendScreeningRequest(
  userId: string,
  args: Omit<CreateRequestArgs, "createdByUserId">,
) {
  await assertCompanyAccess(userId, args.companyId);
  const created = await createScreeningRequest(getDb(), { ...args, createdByUserId: userId });
  if (!created) throw new DomainError(404, "NOT_FOUND", "Template not found for this company");
  await deliverInvitation(created.request);
  return created;
}

/**
 * Send a role's screening template to an existing applicant straight from the
 * pipeline (#1855) — candidate + company resolve from the application.
 */
export async function sendScreeningFromApplication(
  userId: string,
  body: { applicationId: string; templateId: string; message?: string; expiresInDays?: number },
) {
  const ctx = await resolveApplicationForScreening(getDb(), body.applicationId);
  if (!ctx) throw new DomainError(404, "NOT_FOUND", "Application not found");
  if (!ctx.companyId) {
    throw new DomainError(409, "CONFLICT", "Link this job to a company before sending a screening");
  }
  if (!ctx.candidateEmail) throw new DomainError(409, "CONFLICT", "This applicant has no email on file");
  return sendScreeningRequest(userId, {
    companyId: ctx.companyId,
    templateId: body.templateId,
    candidateEmail: ctx.candidateEmail,
    candidateName: ctx.candidateName,
    candidateUserId: ctx.candidateUserId,
    jobId: ctx.jobId,
    applicationId: ctx.applicationId,
    message: body.message,
    expiresInDays: body.expiresInDays,
  });
}

export async function resendScreeningRequest(userId: string, requestId: string) {
  const request = await loadAccessibleRequest(userId, requestId);
  return deliverInvitation(request, { incrementResend: true });
}

// ── Candidate portal (token-authorized) ──────────────────────────────────────

export async function loadScreeningPortal(token: string): Promise<RequestWithItems> {
  const loaded = await getRequestByToken(getDb(), token);
  if (!loaded) throw linkUnavailable();
  return loaded;
}

export async function claimScreeningPortal(token: string, userId: string): Promise<RequestWithItems> {
  const loaded = await claimRequest(getDb(), token, userId);
  if (!loaded) throw linkUnavailable();
  return loaded;
}

export async function satisfyScreeningPortalItem(
  token: string,
  itemId: string,
  payload: { resultRef?: Record<string, unknown>; candidateUserId?: string | null },
): Promise<RequestWithItems> {
  const loaded = await satisfyRequestItem(getDb(), token, itemId, payload);
  if (!loaded) throw linkUnavailable();
  return loaded;
}
