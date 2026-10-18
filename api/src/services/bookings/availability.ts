/** Bookings host availability — recurring weekly rules + one-off overrides. */

import type {
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
} from "../../../../shared/bookings.js";
import type {
  IBookingAvailabilityReader,
  IBookingAvailabilityWriter,
  IBookingHostReader,
} from "../../repositories/bookingsRepository.js";
import { BookingsServiceError } from "./errors.js";
import { invalidateHostCaches } from "./cache.js";
import { requireOwnHost } from "./host.js";

export interface AvailabilityWriteDeps {
  repo: IBookingHostReader & IBookingAvailabilityWriter;
}

export async function listAvailabilityRules(
  deps: { repo: IBookingHostReader & IBookingAvailabilityReader },
  userId: string,
) {
  const host = await requireOwnHost(deps, userId);
  return deps.repo.listAvailabilityRulesForHost(host.userId);
}

export async function addAvailabilityRule(
  deps: AvailabilityWriteDeps,
  userId: string,
  input: AvailabilityRuleInput,
) {
  const host = await requireOwnHost(deps, userId);
  const row = await deps.repo.insertAvailabilityRule({
    userId: host.userId,
    weekday: input.weekday,
    startTimeLocal: input.startTimeLocal,
    endTimeLocal: input.endTimeLocal,
    effectiveFromDate: input.effectiveFromDate ?? null,
    effectiveUntilDate: input.effectiveUntilDate ?? null,
  });
  invalidateHostCaches(host);
  return row;
}

export async function deleteAvailabilityRule(
  deps: AvailabilityWriteDeps,
  userId: string,
  ruleId: string,
): Promise<void> {
  const host = await requireOwnHost(deps, userId);
  const ok = await deps.repo.deleteAvailabilityRule(ruleId, host.userId);
  if (!ok) throw new BookingsServiceError("NOT_FOUND", "Rule not found");
  invalidateHostCaches(host);
}

export async function addAvailabilityOverride(
  deps: AvailabilityWriteDeps,
  userId: string,
  input: AvailabilityOverrideInput,
) {
  const host = await requireOwnHost(deps, userId);
  const row = await deps.repo.insertAvailabilityOverride({
    userId: host.userId,
    dateLocal: input.dateLocal,
    startTimeLocal: input.startTimeLocal,
    endTimeLocal: input.endTimeLocal,
    kind: input.kind,
    reason: input.reason ?? null,
  });
  invalidateHostCaches(host);
  return row;
}

export async function deleteAvailabilityOverride(
  deps: AvailabilityWriteDeps,
  userId: string,
  overrideId: string,
): Promise<void> {
  const host = await requireOwnHost(deps, userId);
  const ok = await deps.repo.deleteAvailabilityOverride(overrideId, host.userId);
  if (!ok) throw new BookingsServiceError("NOT_FOUND", "Override not found");
  invalidateHostCaches(host);
}
