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

// ── Public reads ──────────────────────────────────────────────────────────

export async function fetchPublicHost(handle: string): Promise<PublicHostProfileDTO> {
  return apiClient.fetchData<PublicHostProfileDTO>(`/api/bookings/public/host/${encodeURIComponent(handle)}`);
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
  return apiClient.fetchData<{
    host: PublicHostProfileDTO;
    offering: BookingOfferingDTO;
    slots: PublicSlotDTO[];
  }>(`/api/bookings/public/host/${encodeURIComponent(args.handle)}/availability?${q.toString()}`);
}

export async function createPublicReservation(
  input: CreateReservationInput,
): Promise<{ reservation: ReservationDetailDTO; magicLinkToken: string }> {
  return apiClient.fetchData<{ reservation: ReservationDetailDTO; magicLinkToken: string }>(`/api/bookings/public/reservations`, { method: "POST", body: input });
}

// ── Booker (magic-link) ───────────────────────────────────────────────────

export async function fetchReservationByToken(token: string): Promise<ReservationDetailDTO> {
  return apiClient.fetchData<ReservationDetailDTO>(`/api/bookings/r/${encodeURIComponent(token)}`);
}

export async function listCommentsByToken(token: string): Promise<BookingCommentDTO[]> {
  return apiClient.fetchData<BookingCommentDTO[]>(`/api/bookings/r/${encodeURIComponent(token)}/comments`);
}

export async function addCommentByToken(
  token: string,
  bodyMd: string,
): Promise<BookingCommentDTO> {
  return apiClient.fetchData<BookingCommentDTO>(`/api/bookings/r/${encodeURIComponent(token)}/comments`, { method: "POST", body: { bodyMd } });
}

export async function rescheduleByToken(
  token: string,
  input: RescheduleReservationInput,
): Promise<ReservationDetailDTO> {
  return apiClient.fetchData<ReservationDetailDTO>(`/api/bookings/r/${encodeURIComponent(token)}/reschedule`, { method: "POST", body: input });
}

export async function cancelByToken(
  token: string,
  input: CancelReservationInput,
): Promise<ReservationDetailDTO> {
  return apiClient.fetchData<ReservationDetailDTO>(`/api/bookings/r/${encodeURIComponent(token)}/cancel`, { method: "POST", body: input });
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
  return apiClient.fetchData<{
    userId: string;
    handle: string;
    displayName: string;
    bio: string | null;
    timezone: string;
    avatarUrl: string | null;
    platformFeeBps: number;
    bookingsActive: boolean;
  }>(`/api/bookings/me/host`);
}

export async function listOwnedOfferings(): Promise<BookingOfferingDTO[]> {
  return apiClient.fetchData<BookingOfferingDTO[]>(`/api/bookings/me/offerings`);
}

export async function createOffering(input: BookingOfferingInput): Promise<BookingOfferingDTO> {
  return apiClient.fetchData<BookingOfferingDTO>(`/api/bookings/me/offerings`, { method: "POST", body: input });
}

export async function updateOffering(
  id: string,
  input: BookingOfferingInput,
): Promise<BookingOfferingDTO> {
  return apiClient.fetchData<BookingOfferingDTO>(`/api/bookings/me/offerings/${encodeURIComponent(id)}`, { method: "PUT", body: input });
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
  return apiClient.fetchData<Array<{
      id: string;
      weekday: number;
      startTimeLocal: string;
      endTimeLocal: string;
      effectiveFromDate: string | null;
      effectiveUntilDate: string | null;
    }>>(`/api/bookings/me/availability/rules`);
}

export async function addAvailabilityRule(input: AvailabilityRuleInput) {
  return apiClient.fetchData<unknown>(`/api/bookings/me/availability/rules`, { method: "POST", body: input });
}

export async function deleteAvailabilityRule(id: string): Promise<void> {
  await apiClient.delete(`/api/bookings/me/availability/rules/${encodeURIComponent(id)}`);
}

export async function addAvailabilityOverride(input: AvailabilityOverrideInput) {
  return apiClient.fetchData<unknown>(`/api/bookings/me/availability/overrides`, { method: "POST", body: input });
}

export async function deleteAvailabilityOverride(id: string): Promise<void> {
  await apiClient.delete(`/api/bookings/me/availability/overrides/${encodeURIComponent(id)}`);
}

export async function listOwnedReservations(): Promise<ReservationSummaryDTO[]> {
  return apiClient.fetchData<ReservationSummaryDTO[]>(`/api/bookings/me/reservations`);
}

export async function fetchOwnedReservation(id: string): Promise<ReservationDetailDTO> {
  return apiClient.fetchData<ReservationDetailDTO>(`/api/bookings/me/reservations/${encodeURIComponent(id)}`);
}

export async function listReservationComments(id: string): Promise<BookingCommentDTO[]> {
  return apiClient.fetchData<BookingCommentDTO[]>(`/api/bookings/me/reservations/${encodeURIComponent(id)}/comments`);
}

export async function addReservationComment(
  id: string,
  bodyMd: string,
): Promise<BookingCommentDTO> {
  return apiClient.fetchData<BookingCommentDTO>(`/api/bookings/me/reservations/${encodeURIComponent(id)}/comments`, { method: "POST", body: { bodyMd } });
}

export async function cancelOwnedReservation(
  id: string,
  input: CancelReservationInput,
): Promise<ReservationDetailDTO> {
  return apiClient.fetchData<ReservationDetailDTO>(`/api/bookings/me/reservations/${encodeURIComponent(id)}/cancel`, { method: "POST", body: input });
}

export async function rescheduleOwnedReservation(
  id: string,
  input: RescheduleReservationInput,
): Promise<ReservationDetailDTO> {
  return apiClient.fetchData<ReservationDetailDTO>(`/api/bookings/me/reservations/${encodeURIComponent(id)}/reschedule`, { method: "POST", body: input });
}

export async function markReservationPaid(id: string): Promise<ReservationDetailDTO> {
  return apiClient.fetchData<ReservationDetailDTO>(`/api/bookings/me/reservations/${encodeURIComponent(id)}/mark-paid`, { method: "POST", body: { paymentIntentId: "manual:host" } });
}
