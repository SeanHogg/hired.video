/**
 * Recruiter placement use cases — create (single + bulk #225), back-office
 * edit (#229), commission + guarantee status, reads. Commission summary,
 * splits (#228) and notification subscriptions (#230) live in
 * placement-commission.ts. Route: routes/recruiter/placements.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import { buildPlacementNotificationService } from "../notifications/placement-notifications.js";
import { deriveLegacyCommissionFields, resolvePlacementFeeCents, sanitizePlacementBackOffice } from "./placement-fee.js";
import {
  findOwnedPlacement,
  findUserName,
  insertPlacement,
  insertPlacements,
  listPlacementsForRecruiter,
  updateOwnedPlacement,
  type PlacementRow,
} from "../../repositories/placementsRepository.js";
import { findSubmissionById } from "../../repositories/recruiterSubmissionsRepository.js";
import type { JsonBody } from "./talent-pool.js";
import { COMMISSION_STATUSES, parseStatus } from "../../../../shared/statuses.js";

/** Bulk save cap per call (#225). */
export const PLACEMENT_BULK_CAP = 50;

export type PlacementDto = ReturnType<typeof rowToPlacement>;

export function rowToPlacement(row: PlacementRow) {
  const annualSalaryDollars = row.annualSalary != null
    ? Number(row.annualSalary)
    : (row.salary != null ? Number(row.salary) : 0);
  const resolved = resolvePlacementFeeCents({
    feeMode: row.feeMode,
    feeFlatCents: row.feeFlatCents,
    feePercentBps: row.feePercentBps,
    annualSalaryDollars,
    legacyCommissionAmountDollars: row.commissionAmount,
    legacyCommissionPercentage: row.commissionPercentage,
  });
  return {
    id: row.id,
    submissionId: row.submissionId ?? null,
    recruiterUserId: row.recruiterId,
    recruiterName: row.recruiterName,
    candidateUserId: row.candidateId,
    candidateName: row.candidateName,
    jobId: row.jobId ?? "",
    jobTitle: row.jobTitle ?? "",
    companyName: row.companyName ?? "",
    startDate: row.startDate?.toISOString() ?? null,
    annualSalary: annualSalaryDollars,
    feeMode: resolved.mode,
    feeCents: resolved.cents,
    feeFlatCents: row.feeFlatCents ?? null,
    feePercentBps: row.feePercentBps ?? null,
    commissionPercentage: Number(row.commissionPercentage) || 0,
    commissionAmount: Number(row.commissionAmount) || 0,
    commissionStatus: row.commissionStatus,
    commissionPaidDate: row.commissionPaidDate?.toISOString() ?? null,
    paymentReference: row.paymentReference ?? null,
    guaranteePeriodDays: row.guaranteePeriodDays ?? null,
    guaranteeEndDate: row.guaranteeEndDate?.toISOString() ?? null,
    guaranteeMetStatus: row.guaranteeMetStatus ?? null,
    notes: row.notes ?? null,
    // #226 — Placement Type (FK → workspace_job_types). The frontend
    // resolves the label from the job-types list it already fetches for
    // the picker, so we expose only the id here (no extra join).
    placementTypeId: row.placementTypeId ?? null,
    placementKind: row.placementKind ?? null,
    placedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface IncomingPlacementFee {
  feeMode?: "flat" | "percent" | string | null;
  feeFlatCents?: number | string | null;
  feePercentBps?: number | string | null;
  commissionPercentage?: number | string | null;
  annualSalary?: number | string | null;
}

export function deriveFeeFieldsFromBody(body: IncomingPlacementFee | JsonBody) {
  const annualSalary = Number(body.annualSalary ?? 0) || 0;
  const incomingMode: "flat" | "percent" = body.feeMode === "flat" ? "flat" : "percent";
  const resolved = resolvePlacementFeeCents({
    feeMode: incomingMode,
    feeFlatCents: body.feeFlatCents != null ? Number(body.feeFlatCents) : null,
    feePercentBps: body.feePercentBps != null ? Number(body.feePercentBps) : null,
    annualSalaryDollars: annualSalary,
    legacyCommissionAmountDollars: null,
    // Legacy: if a client still sends commissionPercentage, treat it as
    // a percent input so old integrations keep working unchanged.
    legacyCommissionPercentage: body.commissionPercentage,
  });
  const legacy = deriveLegacyCommissionFields(resolved, annualSalary);
  return {
    feeMode: resolved.mode,
    feeFlatCents: resolved.mode === "flat" ? resolved.cents : null,
    feePercentBps:
      resolved.mode === "percent"
        ? (body.feePercentBps != null
          ? Math.max(0, Math.round(Number(body.feePercentBps)))
          : (annualSalary > 0
            ? Math.round((resolved.cents / (annualSalary * 100)) * 10_000)
            : 0))
        : null,
    commissionPercentage: legacy.commissionPercentage,
    commissionAmount: legacy.commissionAmount,
  };
}

/** Guarantee end = start + N days (only when both are given). */
function guaranteeEndFor(startDate: unknown, periodDays: unknown): Date | null {
  if (!startDate || !periodDays) return null;
  const end = new Date(startDate as string);
  end.setDate(end.getDate() + Number(periodDays));
  return end;
}

/** Columns shared by the single + bulk create paths. */
function placementBaseValues(recruiterId: string, recruiterName: string, p: JsonBody) {
  const annualSalary = Number(p.annualSalary ?? 0);
  const feeFields = deriveFeeFieldsFromBody(p);
  return {
    recruiterId,
    recruiterName,
    submissionId: p.submissionId ?? null,
    startDate: p.startDate ? new Date(p.startDate) : null,
    annualSalary: annualSalary || null,
    feeMode: feeFields.feeMode,
    feeFlatCents: feeFields.feeFlatCents,
    feePercentBps: feeFields.feePercentBps,
    commissionPercentage: feeFields.commissionPercentage,
    commissionAmount: feeFields.commissionAmount,
    commissionStatus: "pending",
    guaranteePeriodDays: p.guaranteePeriodDays ?? null,
    guaranteeEndDate: guaranteeEndFor(p.startDate, p.guaranteePeriodDays),
    notes: p.notes ?? null,
  };
}

/** Record a placement. Candidate/job names come from the linked submission
 *  when one is given, else from the body. */
export async function createPlacement(recruiterId: string, body: JsonBody): Promise<PlacementDto> {
  const recruiterName = await findUserName(recruiterId);

  let candidateId = body.candidateUserId ?? recruiterId;
  let candidateName = body.candidateName ?? "";
  let jobId = body.jobId ?? null;
  let jobTitle = body.jobTitle ?? "";
  let companyName = body.companyName ?? "";
  if (body.submissionId) {
    const sub = await findSubmissionById(body.submissionId);
    if (sub) {
      candidateId = sub.candidateId;
      candidateName = sub.candidateName || candidateName;
      jobId = sub.jobId ?? jobId;
      jobTitle = sub.jobTitle ?? jobTitle;
      companyName = sub.companyName ?? companyName;
    }
  }

  const placement = await insertPlacement({
    ...placementBaseValues(recruiterId, recruiterName ?? "", body),
    candidateId,
    candidateName,
    jobId: jobId ?? null,
    jobTitle,
    companyName,
    // #226 — Placement Type field FK → workspace_job_types. Optional;
    // when absent the placement inherits no financial defaults.
    placementTypeId: body.placementTypeId ?? null,
    // #229 — back-office axis (invoice / payable / payroll): whitelisted +
    // coerced by the shared sanitizer so create can't inject arbitrary columns.
    ...sanitizePlacementBackOffice(body),
  });
  return rowToPlacement(placement);
}

/** #230 — auto-subscribe the owning recruiter to the placement's stage
 *  events, then fire `signed`. Best-effort: never fails the write. */
export async function announcePlacementSigned(placementId: string, recruiterId: string): Promise<void> {
  try {
    const svc = buildPlacementNotificationService(getDb());
    await svc.subscribeAll(placementId, recruiterId);
    await svc.notifyEvent(placementId, "signed");
  } catch (err) {
    logger.warn("[recruiter] placement signed-notify failed", err);
  }
}

/** #225 — N independent placements in one round-trip; any failing row
 *  fails the whole batch (single INSERT). */
export async function createPlacementsBulk(recruiterId: string, body: JsonBody | null): Promise<PlacementDto[]> {
  if (!body || !Array.isArray(body.placements) || body.placements.length === 0) {
    throw new DomainError(400, "VALIDATION_ERROR", "placements array required");
  }
  if (body.placements.length > PLACEMENT_BULK_CAP) {
    throw new DomainError(400, "VALIDATION_ERROR", "Bulk cap is 50 placements per call");
  }
  const recruiterName = (await findUserName(recruiterId)) ?? "";
  const rows = (body.placements as JsonBody[]).map((p) => ({
    ...placementBaseValues(recruiterId, recruiterName, p),
    candidateId: p.candidateUserId ?? recruiterId,
    candidateName: p.candidateName ?? "",
    jobId: p.jobId ?? null,
    jobTitle: p.jobTitle ?? "",
    companyName: p.companyName ?? "",
    placementTypeId: p.placementTypeId ?? null,
  }));
  return (await insertPlacements(rows)).map(rowToPlacement);
}

/** #229 — edit the back-office axis post-create (same sanitizer as create),
 *  plus notes and the Placement Type (#226: ""/null clears, uuid sets). */
export async function updatePlacementBackOffice(recruiterId: string, id: string, body: JsonBody): Promise<PlacementDto | null> {
  const updated = await updateOwnedPlacement(recruiterId, id, {
    ...sanitizePlacementBackOffice(body),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.placementTypeId !== undefined
      ? { placementTypeId: typeof body.placementTypeId === "string" && body.placementTypeId ? body.placementTypeId : null }
      : {}),
    updatedAt: new Date(),
  });
  return updated ? rowToPlacement(updated) : null;
}

export async function listPlacements(recruiterId: string): Promise<PlacementDto[]> {
  return (await listPlacementsForRecruiter(recruiterId)).map(rowToPlacement);
}

export async function getPlacement(recruiterId: string, id: string): Promise<PlacementDto | null> {
  const row = await findOwnedPlacement(recruiterId, id);
  return row ? rowToPlacement(row) : null;
}

export async function updateCommissionStatus(recruiterId: string, id: string, body: JsonBody): Promise<PlacementDto | null> {
  const updated = await updateOwnedPlacement(recruiterId, id, {
    commissionStatus: parseStatus(COMMISSION_STATUSES, body.status, "pending"),
    commissionPaidDate: body.paidDate ? new Date(body.paidDate) : null,
    paymentReference: body.paymentReference ?? null,
    updatedAt: new Date(),
  });
  return updated ? rowToPlacement(updated) : null;
}

/** Update guarantee status; #230 — notify subscribers when marked met. */
export async function updateGuaranteeStatus(recruiterId: string, id: string, body: JsonBody): Promise<PlacementDto | null> {
  const updated = await updateOwnedPlacement(recruiterId, id, {
    guaranteeMetStatus: body.guaranteeMet ?? null,
    notes: body.notes ?? undefined,
    updatedAt: new Date(),
  });
  if (!updated) return null;
  if (body.guaranteeMet === true) {
    try {
      await buildPlacementNotificationService(getDb()).notifyEvent(id, "guarantee_met");
    } catch (err) {
      logger.warn("[recruiter] placement guarantee-notify failed", err);
    }
  }
  return rowToPlacement(updated);
}
