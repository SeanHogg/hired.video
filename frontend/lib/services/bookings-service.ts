/**
 * Bookings client — single seam every component uses to call /api/bookings.
 * Mirrors the wire types from shared/bookings.ts; no inline fetches in pages.
 */

import { apiClient } from "@/lib/api-client";
import type {
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  BookingCommentDTO,
  BookingOfferingDTO,
  BookingOfferingInput,
  CancelReservationInput,
  CreateReservationInput,
  PublicHostProfileDTO,
  PublicSlotDTO,
  RescheduleReservationInput,
  ReservationDetailDTO,
  ReservationSummaryDTO,
} from "@shared/bookings";

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

function unwrap<T>(res: { data: unknown }): T {
  // Backend returns { success: true, data: T } via the shared `success()` helper.
  const env = res.data as ApiEnvelope<T> | T;
  if (env && typeof env === "object" && "success" in (env as object) && "data" in (env as object)) {
    return (env as ApiEnvelope<T>).data;
  }
  return env as T;
}

// ── Public reads ──────────────────────────────────────────────────────────

export async function fetchPublicHost(handle: string): Promise<PublicHostProfileDTO> {
  const res = await apiClient.request<PublicHostProfileDTO>(
    `/api/bookings/public/host/${encodeURIComponent(handle)}`,
    { method: "GET" },
  );
  return unwrap<PublicHostProfileDTO>(res);
}

export async function fetchPublicAvailability(args: {
  handle: string;
  offeringSlug: string;
  fromUtc: string;
  toUtc: string;
}): Promise<{
  host: PublicHostProfileDTO;
  offering: BookingOfferingDTO;
  slots: PublicSlotDTO[];
}> {
  const q = new URLSearchParams({
    offering: args.offeringSlug,
    from: args.fromUtc,
    to: args.toUtc,
  });
  const res = await apiClient.request<{
    host: PublicHostProfileDTO;
    offering: BookingOfferingDTO;
    slots: PublicSlotDTO[];
  }>(
    `/api/bookings/public/host/${encodeURIComponent(args.handle)}/availability?${q.toString()}`,
    { method: "GET" },
  );
  return unwrap(res);
}

export async function createPublicReservation(
  input: CreateReservationInput,
): Promise<{ reservation: ReservationDetailDTO; magicLinkToken: string }> {
  const res = await apiClient.post<{ reservation: ReservationDetailDTO; magicLinkToken: string }>(
    `/api/bookings/public/reservations`,
    input,
  );
  return unwrap(res);
}

// ── Booker (magic-link) ───────────────────────────────────────────────────

export async function fetchReservationByToken(token: string): Promise<ReservationDetailDTO> {
  const res = await apiClient.request<ReservationDetailDTO>(
    `/api/bookings/r/${encodeURIComponent(token)}`,
    { method: "GET" },
  );
  return unwrap(res);
}

export async function listCommentsByToken(token: string): Promise<BookingCommentDTO[]> {
  const res = await apiClient.request<BookingCommentDTO[]>(
    `/api/bookings/r/${encodeURIComponent(token)}/comments`,
    { method: "GET" },
  );
  return unwrap(res);
}

export async function addCommentByToken(
  token: string,
  bodyMd: string,
): Promise<BookingCommentDTO> {
  const res = await apiClient.post<BookingCommentDTO>(
    `/api/bookings/r/${encodeURIComponent(token)}/comments`,
    { bodyMd },
  );
  return unwrap(res);
}

export async function rescheduleByToken(
  token: string,
  input: RescheduleReservationInput,
): Promise<ReservationDetailDTO> {
  const res = await apiClient.post<ReservationDetailDTO>(
    `/api/bookings/r/${encodeURIComponent(token)}/reschedule`,
    input,
  );
  return unwrap(res);
}

export async function cancelByToken(
  token: string,
  input: CancelReservationInput,
): Promise<ReservationDetailDTO> {
  const res = await apiClient.post<ReservationDetailDTO>(
    `/api/bookings/r/${encodeURIComponent(token)}/cancel`,
    input,
  );
  return unwrap(res);
}

// ── Host (auth) ───────────────────────────────────────────────────────────

export async function fetchOwnHost(): Promise<{
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  timezone: string;
  avatarUrl: string | null;
  platformFeeBps: number;
  bookingsActive: boolean;
}> {
  const res = await apiClient.request<{
    userId: string;
    handle: string;
    displayName: string;
    bio: string | null;
    timezone: string;
    avatarUrl: string | null;
    platformFeeBps: number;
    bookingsActive: boolean;
  }>(`/api/bookings/me/host`, { method: "GET" });
  return unwrap(res);
}

export async function listOwnedOfferings(): Promise<BookingOfferingDTO[]> {
  const res = await apiClient.request<BookingOfferingDTO[]>(
    `/api/bookings/me/offerings`,
    { method: "GET" },
  );
  return unwrap(res);
}

export async function createOffering(input: BookingOfferingInput): Promise<BookingOfferingDTO> {
  const res = await apiClient.post<BookingOfferingDTO>(`/api/bookings/me/offerings`, input);
  return unwrap(res);
}

export async function updateOffering(
  id: string,
  input: BookingOfferingInput,
): Promise<BookingOfferingDTO> {
  const res = await apiClient.put<BookingOfferingDTO>(
    `/api/bookings/me/offerings/${encodeURIComponent(id)}`,
    input,
  );
  return unwrap(res);
}

export async function deleteOffering(id: string): Promise<void> {
  await apiClient.delete<{ deleted: boolean }>(
    `/api/bookings/me/offerings/${encodeURIComponent(id)}`,
  );
}

export async function listAvailabilityRules(): Promise<
  Array<{
    id: string;
    weekday: number;
    startTimeLocal: string;
    endTimeLocal: string;
    effectiveFromDate: string | null;
    effectiveUntilDate: string | null;
  }>
> {
  const res = await apiClient.request<
    Array<{
      id: string;
      weekday: number;
      startTimeLocal: string;
      endTimeLocal: string;
      effectiveFromDate: string | null;
      effectiveUntilDate: string | null;
    }>
  >(`/api/bookings/me/availability/rules`, { method: "GET" });
  return unwrap(res);
}

export async function addAvailabilityRule(input: AvailabilityRuleInput) {
  const res = await apiClient.post(`/api/bookings/me/availability/rules`, input);
  return unwrap(res);
}

export async function deleteAvailabilityRule(id: string): Promise<void> {
  await apiClient.delete(`/api/bookings/me/availability/rules/${encodeURIComponent(id)}`);
}

export async function addAvailabilityOverride(input: AvailabilityOverrideInput) {
  const res = await apiClient.post(`/api/bookings/me/availability/overrides`, input);
  return unwrap(res);
}

export async function deleteAvailabilityOverride(id: string): Promise<void> {
  await apiClient.delete(`/api/bookings/me/availability/overrides/${encodeURIComponent(id)}`);
}

export async function listOwnedReservations(): Promise<ReservationSummaryDTO[]> {
  const res = await apiClient.request<ReservationSummaryDTO[]>(
    `/api/bookings/me/reservations`,
    { method: "GET" },
  );
  return unwrap(res);
}

export async function fetchOwnedReservation(id: string): Promise<ReservationDetailDTO> {
  const res = await apiClient.request<ReservationDetailDTO>(
    `/api/bookings/me/reservations/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  return unwrap(res);
}

export async function listReservationComments(id: string): Promise<BookingCommentDTO[]> {
  const res = await apiClient.request<BookingCommentDTO[]>(
    `/api/bookings/me/reservations/${encodeURIComponent(id)}/comments`,
    { method: "GET" },
  );
  return unwrap(res);
}

export async function addReservationComment(
  id: string,
  bodyMd: string,
): Promise<BookingCommentDTO> {
  const res = await apiClient.post<BookingCommentDTO>(
    `/api/bookings/me/reservations/${encodeURIComponent(id)}/comments`,
    { bodyMd },
  );
  return unwrap(res);
}

export async function cancelOwnedReservation(
  id: string,
  input: CancelReservationInput,
): Promise<ReservationDetailDTO> {
  const res = await apiClient.post<ReservationDetailDTO>(
    `/api/bookings/me/reservations/${encodeURIComponent(id)}/cancel`,
    input,
  );
  return unwrap(res);
}

export async function rescheduleOwnedReservation(
  id: string,
  input: RescheduleReservationInput,
): Promise<ReservationDetailDTO> {
  const res = await apiClient.post<ReservationDetailDTO>(
    `/api/bookings/me/reservations/${encodeURIComponent(id)}/reschedule`,
    input,
  );
  return unwrap(res);
}

export async function markReservationPaid(id: string): Promise<ReservationDetailDTO> {
  const res = await apiClient.post<ReservationDetailDTO>(
    `/api/bookings/me/reservations/${encodeURIComponent(id)}/mark-paid`,
    { paymentIntentId: "manual:host" },
  );
  return unwrap(res);
}
