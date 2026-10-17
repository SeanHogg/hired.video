/** Workforce Phase 4 (#1422) — per-placement desk margin read model. */

import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { resolveEmployerCompanyIds } from "./tenancy.js";

const { billingEvents, placements, users } = schema;

export interface DeskMarginRow {
  placementId: string;
  candidateId: string;
  candidateName: string;
  recruiterId: string | null;
  recruiterName: string | null;
  placementKind: string | null;
  startDate: string | null;
  endDate: string | null;
  billRateHourly: number;
  payRateHourly: number;
  currency: string;
  billableHoursYTD: number;
  totalHoursYTD: number;
  revenueCents: number;
  payoutCents: number;
  grossMarginCents: number;
  approvedTimesheetCount: number;
}

/** Per-placement desk margin rollup for an employer's workforce. Sources
 *  from approved timesheets only (via billing_events 'workforce_timesheet_derived')
 *  so amounts always match what was invoiced.
 *
 *  Period: year-to-date by default; date-range filter can come later.
 *  No new schema — pure read model over existing tables. (#1422) */
export async function getDeskMargin(
  employerId: string,
  db = getDb(),
): Promise<DeskMarginRow[]> {
  const employerCompanies = await resolveEmployerCompanyIds(employerId, db);
  if (employerCompanies.length === 0) return [];

  // All placements with at least one timesheet derivation from approved
  // timesheets where ts.companyId belongs to the employer (the indexed
  // `billing_events.company_id`, migration 0613). The per-event figures live
  // in the JSONB payload, so the aggregation stays in JS.
  const events = await db.select({
    payload: billingEvents.payload,
    createdAt: billingEvents.createdAt,
  })
    .from(billingEvents)
    .where(and(
      eq(billingEvents.eventType, "workforce_timesheet_derived"),
      // Drizzle binds the array as IN (param1, …), which avoids the worker
      // pg driver's broken ANY-with-JS-array coercion (#1419 root cause).
      inArray(billingEvents.companyId, employerCompanies),
    ));

  if (events.length === 0) return [];

  const placementIds = new Set<string>();
  type Agg = {
    billableHours: number; totalHours: number;
    revenueCents: number; payoutCents: number; tsCount: number;
  };
  const aggByPlacement = new Map<string, Agg>();

  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const placementId = String(p.placementId ?? "");
    if (!placementId) continue;
    placementIds.add(placementId);

    const billableHours = Number(p.billableHours ?? 0);
    const totalHours = Number(p.totalHours ?? 0);
    const billRate = Number(p.billRateHourly ?? 0);
    const payRate = Number(p.payRateHourly ?? 0);
    const revenueCents = Math.round(billableHours * billRate * 100);
    const payoutCents = Math.round(totalHours * payRate * 100);

    const current = aggByPlacement.get(placementId) ?? {
      billableHours: 0, totalHours: 0, revenueCents: 0, payoutCents: 0, tsCount: 0,
    };
    current.billableHours += billableHours;
    current.totalHours += totalHours;
    current.revenueCents += revenueCents;
    current.payoutCents += payoutCents;
    current.tsCount += 1;
    aggByPlacement.set(placementId, current);
  }

  if (placementIds.size === 0) return [];

  // Hydrate the placement rows in one query.
  const placementRows = await db.select().from(placements)
    .where(inArray(placements.id, Array.from(placementIds)));

  // Recruiter name lookup.
  const recruiterIds = Array.from(new Set(placementRows.map((p) => p.recruiterId).filter(Boolean))) as string[];
  const recruiterRows = recruiterIds.length > 0
    ? await db.select({ id: users.id, name: users.name }).from(users)
        .where(inArray(users.id, recruiterIds))
    : [];
  const recruiterNameById = new Map(recruiterRows.map((r) => [r.id, r.name]));

  return placementRows.map((p) => {
    const agg = aggByPlacement.get(p.id)!;
    return {
      placementId: p.id,
      candidateId: p.candidateId,
      candidateName: p.candidateName || "Unknown",
      recruiterId: p.recruiterId ?? null,
      recruiterName: p.recruiterId ? (recruiterNameById.get(p.recruiterId) ?? null) : null,
      placementKind: p.placementKind ?? null,
      startDate: p.startDate ? new Date(p.startDate as any).toISOString() : null,
      endDate: p.endDate ? new Date(p.endDate as any).toISOString() : null,
      billRateHourly: Number(p.billRateHourly ?? 0),
      payRateHourly: Number(p.payRateHourly ?? 0),
      currency: p.currency ?? "USD",
      billableHoursYTD: Number(agg.billableHours.toFixed(2)),
      totalHoursYTD: Number(agg.totalHours.toFixed(2)),
      revenueCents: agg.revenueCents,
      payoutCents: agg.payoutCents,
      grossMarginCents: agg.revenueCents - agg.payoutCents,
      approvedTimesheetCount: agg.tsCount,
    };
  }).sort((a, b) => b.grossMarginCents - a.grossMarginCents);
}
