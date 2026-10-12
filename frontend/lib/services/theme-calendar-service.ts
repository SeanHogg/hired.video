/**
 * Theme calendar client — /api/theme-calendar (public events the picker
 * reads) and /api/admin/theme-calendar (SuperAdmin editor). Contract:
 * shared/theme-calendar/event.ts.
 */
import { apiClient } from "@/lib/api-client";
import type { ThemeEvent, ThemeEventDate, ThemeEventInput } from "@shared/theme-calendar/event";

export interface AdminThemeCalendar {
  events: ThemeEvent[];
  missingDates: { eventId: string; slug: string; year: number }[];
}

const ADMIN = "/api/admin/theme-calendar";

export const themeCalendarService = {
  async events(): Promise<ThemeEvent[]> {
    const res = await apiClient.get<{ events: ThemeEvent[] }>("/api/theme-calendar/events");
    return res.data.events;
  },
  async adminCalendar(): Promise<AdminThemeCalendar> {
    return (await apiClient.get<AdminThemeCalendar>(ADMIN)).data;
  },
  async create(input: ThemeEventInput): Promise<ThemeEvent> {
    return (await apiClient.post<ThemeEvent>(ADMIN, input)).data;
  },
  async update(id: string, input: ThemeEventInput): Promise<ThemeEvent> {
    return (await apiClient.put<ThemeEvent>(`${ADMIN}/${id}`, input)).data;
  },
  async setActive(id: string, isActive: boolean): Promise<ThemeEvent> {
    return (await apiClient.patch<ThemeEvent>(`${ADMIN}/${id}/active`, { isActive })).data;
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(`${ADMIN}/${id}`);
  },
  async setDate(id: string, date: ThemeEventDate): Promise<ThemeEvent> {
    return (await apiClient.put<ThemeEvent>(`${ADMIN}/${id}/dates`, date)).data;
  },
  async removeDate(id: string, year: number): Promise<ThemeEvent> {
    return (await apiClient.delete<ThemeEvent>(`${ADMIN}/${id}/dates/${year}`)).data;
  },
};
