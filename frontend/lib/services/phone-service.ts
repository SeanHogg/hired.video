import { apiClient } from "@/lib/api-client";
import type { RequestConfig } from "@/lib/api-client";

// Routes through apiClient so URL construction (api.hired.video vs hired.video),
// auth header injection, and error normalization match the rest of the app.
// Returns the unwrapped `data` payload directly — callers expect `T`, not the
// `{ success, data }` envelope.
async function apiFetch<T>(path: string, init?: { method?: RequestConfig["method"]; body?: unknown }): Promise<T> {
  const res = await apiClient.request<T>(path, {
    method: init?.method ?? "GET",
    body: init?.body,
  });
  return res.data;
}

export interface BusinessPhoneNumber {
  id: string;
  userId: string;
  phoneNumber: string;
  friendlyName: string | null;
  forwardingNumber: string | null;
  voicemailEnabled: boolean;
  dndSchedule: Array<{ day: number; startHour: number; endHour: number }> | null;
  greetingText: string | null;
  status: "active" | "suspended" | "released";
  createdAt: string;
}

export interface CallLog {
  id: string;
  phoneNumberId: string;
  phoneNumber: string;
  direction: "inbound" | "outbound";
  callerNumber: string;
  calledNumber: string;
  durationSeconds: number;
  recordingUrl: string | null;
  status: "answered" | "missed" | "voicemail" | "busy" | "failed";
  notes: string | null;
  createdAt: string;
}

export interface SmsMessage {
  id: string;
  phoneNumberId: string;
  phoneNumber: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  body: string;
  status: "received" | "sent" | "failed" | "unread";
  createdAt: string;
}

export interface PhoneBalance {
  balanceCents: number;
  autoTopUpEnabled: boolean;
  autoTopUpThresholdCents: number;
  autoTopUpAmountCents: number;
}

export interface PhoneBalanceTransaction {
  id: string;
  type: "purchase" | "call_charge" | "sms_charge" | "refund" | "monthly_grant";
  amountCents: number;
  balanceCentsAfter: number;
  description: string | null;
  createdAt: string;
}

export interface PhoneUsage {
  minutesUsed: number;
  minutesIncluded: number;
  smsUsed: number;
  smsIncluded: number;
  numbersActive: number;
  numbersIncluded: number;
  periodStart: string;
  periodEnd: string;
}

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string | null;
}

export const phoneService = {
  // ── Numbers ──────────────────────────────────────────────────────────────
  getNumbers: () => apiFetch<BusinessPhoneNumber[]>("/api/phone/numbers"),

  searchAvailable: (params: { areaCode?: string; contains?: string; countryCode?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return apiFetch<AvailableNumber[]>(`/api/phone/numbers/search?${qs}`);
  },

  provisionNumber: (phoneNumber: string, friendlyName?: string) =>
    apiFetch<BusinessPhoneNumber>("/api/phone/numbers", {
      method: "POST",
      body: { phoneNumber, friendlyName },
    }),

  updateNumber: (id: string, data: Partial<Pick<BusinessPhoneNumber, "friendlyName" | "forwardingNumber" | "voicemailEnabled" | "dndSchedule" | "greetingText">>) =>
    apiFetch<BusinessPhoneNumber>(`/api/phone/numbers/${id}`, {
      method: "PATCH",
      body: data,
    }),

  releaseNumber: (id: string) =>
    apiFetch<{ released: boolean }>(`/api/phone/numbers/${id}`, { method: "DELETE" }),

  // ── Calls ─────────────────────────────────────────────────────────────────
  getCalls: (params?: { numberId?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return apiFetch<{ calls: CallLog[]; total: number }>(`/api/phone/calls?${qs}`);
  },

  // ── SMS ───────────────────────────────────────────────────────────────────
  getSms: (params?: { numberId?: string; direction?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return apiFetch<{ messages: SmsMessage[]; total: number }>(`/api/phone/sms?${qs}`);
  },

  sendSms: (data: { phoneNumberId: string; to: string; body: string }) =>
    apiFetch<SmsMessage>("/api/phone/sms", { method: "POST", body: data }),

  // ── Balance ───────────────────────────────────────────────────────────────
  getBalance: () => apiFetch<{ balance: PhoneBalance; transactions: PhoneBalanceTransaction[] }>("/api/phone/balance"),

  createTopupSession: (amountCents: number) =>
    apiFetch<{ checkoutUrl: string }>("/api/phone/balance/topup", {
      method: "POST",
      body: { amountCents },
    }),

  updateAutoTopup: (settings: { enabled: boolean; thresholdCents: number; amountCents: number }) =>
    apiFetch<PhoneBalance>("/api/phone/balance/auto-topup", {
      method: "PATCH",
      body: settings,
    }),

  // ── Usage ─────────────────────────────────────────────────────────────────
  getUsage: () => apiFetch<PhoneUsage>("/api/phone/usage"),
};
