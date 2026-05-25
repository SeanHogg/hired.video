/**
 * Events service — typed client for `/api/events/*`.
 *
 * Shapes mirror shared/events.ts (the SSoT). Routes that mutate take the
 * exact Zod-validated body the backend expects. Reads return the
 * ResolvedEvent DTO from EventService.resolve().
 */
import { apiClient } from "@/lib/api-client";
import type {
  CreateEventInput,
  EventFormat,
  EventSearchFilter,
  ResolvedEvent,
  RsvpInput,
  RsvpStatus,
  UpdateEventInput,
} from "@shared/events";

export interface EventAttendeePublic {
  userId: string;
  name: string;
  avatarUrl: string | null;
  rsvpStatus: RsvpStatus;
  checkedIn: boolean;
}

export interface EventCategory {
  id: string;
  slug: string;
  label: string;
  icon: string | null;
  colorHex: string;
  orderIndex: number;
  isBuiltIn: boolean;
}

export const eventsService = {
  async search(filter: Partial<EventSearchFilter> = {}): Promise<ResolvedEvent[]> {
    const params = new URLSearchParams();
    if (filter.q) params.set("q", filter.q);
    if (filter.category) params.set("category", filter.category);
    if (filter.format) params.set("format", filter.format as EventFormat);
    if (filter.scope) params.set("scope", filter.scope);
    if (filter.fromDate) params.set("fromDate", filter.fromDate);
    if (filter.toDate) params.set("toDate", filter.toDate);
    if (filter.countryId) params.set("countryId", String(filter.countryId));
    if (filter.stateId) params.set("stateId", filter.stateId);
    if (filter.cityId) params.set("cityId", filter.cityId);
    if (filter.latitude != null) params.set("lat", String(filter.latitude));
    if (filter.longitude != null) params.set("lng", String(filter.longitude));
    if (filter.radiusKm) params.set("radiusKm", String(filter.radiusKm));
    if (filter.hostUserId) params.set("hostUserId", filter.hostUserId);
    if (filter.limit) params.set("limit", String(filter.limit));
    if (filter.offset) params.set("offset", String(filter.offset));
    const qs = params.toString();
    const res = await apiClient.get<ResolvedEvent[]>(
      `/api/events${qs ? `?${qs}` : ""}`,
      undefined,
      { suppressErrorEvent: true },
    );
    return res.data ?? [];
  },

  async listMine(scope: "upcoming" | "past" | "all" = "upcoming"): Promise<ResolvedEvent[]> {
    const res = await apiClient.get<ResolvedEvent[]>(`/api/events/mine?scope=${scope}`);
    return res.data ?? [];
  },

  async listCategories(): Promise<EventCategory[]> {
    const res = await apiClient.get<EventCategory[]>(`/api/events/categories`);
    return res.data ?? [];
  },

  async get(idOrSlug: string): Promise<ResolvedEvent> {
    // Heuristic: UUIDv4 length = 36; anything shorter is treated as a slug.
    const path = idOrSlug.length === 36 ? `/api/events/${idOrSlug}` : `/api/events/slug/${idOrSlug}`;
    const res = await apiClient.get<ResolvedEvent>(path);
    return res.data;
  },

  async create(input: CreateEventInput): Promise<ResolvedEvent> {
    const res = await apiClient.post<ResolvedEvent>(`/api/events`, input);
    return res.data;
  },

  async update(id: string, patch: UpdateEventInput): Promise<ResolvedEvent> {
    const res = await apiClient.patch<ResolvedEvent>(`/api/events/${id}`, patch);
    return res.data;
  },

  async publish(id: string): Promise<ResolvedEvent> {
    const res = await apiClient.post<ResolvedEvent>(`/api/events/${id}/publish`, {});
    return res.data;
  },

  async cancel(id: string): Promise<ResolvedEvent> {
    const res = await apiClient.post<ResolvedEvent>(`/api/events/${id}/cancel`, {});
    return res.data;
  },

  async rsvp(id: string, input: RsvpInput): Promise<{ outcome: string }> {
    const res = await apiClient.post<{ outcome: string }>(`/api/events/${id}/rsvp`, input);
    return res.data;
  },

  async listAttendees(id: string): Promise<{ count: number; attendees: EventAttendeePublic[] }> {
    const res = await apiClient.get<{ count: number; attendees: EventAttendeePublic[] }>(
      `/api/events/${id}/attendees`,
    );
    return res.data ?? { count: 0, attendees: [] };
  },

  async approveAttendee(id: string, attendeeId: string): Promise<void> {
    await apiClient.post(`/api/events/${id}/attendees/${attendeeId}/approve`, {});
  },

  async rejectAttendee(id: string, attendeeId: string): Promise<void> {
    await apiClient.post(`/api/events/${id}/attendees/${attendeeId}/reject`, {});
  },

  async checkInAttendee(id: string, attendeeId: string): Promise<void> {
    await apiClient.post(`/api/events/${id}/attendees/${attendeeId}/check-in`, {});
  },

  async getMatches(id: string): Promise<{ matches: EventMatch[] }> {
    const res = await apiClient.get<{ matches: EventMatch[] }>(`/api/events/${id}/matches`);
    return res.data ?? { matches: [] };
  },

  async sendBlast(
    id: string,
    subject: string,
    message: string,
  ): Promise<{ sentTo: number }> {
    const res = await apiClient.post<{ sentTo: number }>(`/api/events/${id}/blast`, {
      subject,
      message,
    });
    return res.data;
  },

  async getAnalytics(id: string): Promise<EventAnalytics> {
    const res = await apiClient.get<EventAnalytics>(`/api/events/${id}/analytics`);
    return res.data;
  },

  attendeeCsvUrl(id: string): string {
    return `/api/events/${id}/attendees/export.csv`;
  },
};

export interface EventAnalytics {
  counts: {
    going: number;
    maybe: number;
    declined: number;
    waitlist: number;
    pendingApproval: number;
    checkedIn: number;
  };
  capacity: number | null;
  attendeeCount: number;
  waitlistCount: number;
  published: boolean;
  cancelled: boolean;
}

export interface EventMatch {
  userId: string;
  score: number;
  reason: string | null;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
}
