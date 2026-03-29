const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as T;
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
  getNumbers: () => apiFetch<BusinessPhoneNumber[]>("/phone/numbers"),

  searchAvailable: (params: { areaCode?: string; contains?: string; countryCode?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return apiFetch<AvailableNumber[]>(`/phone/numbers/search?${qs}`);
  },

  provisionNumber: (phoneNumber: string, friendlyName?: string) =>
    apiFetch<BusinessPhoneNumber>("/phone/numbers", {
      method: "POST",
      body: JSON.stringify({ phoneNumber, friendlyName }),
    }),

  updateNumber: (id: string, data: Partial<Pick<BusinessPhoneNumber, "friendlyName" | "forwardingNumber" | "voicemailEnabled" | "dndSchedule" | "greetingText">>) =>
    apiFetch<BusinessPhoneNumber>(`/phone/numbers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  releaseNumber: (id: string) =>
    apiFetch<{ released: boolean }>(`/phone/numbers/${id}`, { method: "DELETE" }),

  // ── Calls ─────────────────────────────────────────────────────────────────
  getCalls: (params?: { numberId?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return apiFetch<{ calls: CallLog[]; total: number }>(`/phone/calls?${qs}`);
  },

  // ── SMS ───────────────────────────────────────────────────────────────────
  getSms: (params?: { numberId?: string; direction?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return apiFetch<{ messages: SmsMessage[]; total: number }>(`/phone/sms?${qs}`);
  },

  sendSms: (data: { phoneNumberId: string; to: string; body: string }) =>
    apiFetch<SmsMessage>("/phone/sms", { method: "POST", body: JSON.stringify(data) }),

  // ── Balance ───────────────────────────────────────────────────────────────
  getBalance: () => apiFetch<{ balance: PhoneBalance; transactions: PhoneBalanceTransaction[] }>("/phone/balance"),

  createTopupSession: (amountCents: number) =>
    apiFetch<{ checkoutUrl: string }>("/phone/balance/topup", {
      method: "POST",
      body: JSON.stringify({ amountCents }),
    }),

  updateAutoTopup: (settings: { enabled: boolean; thresholdCents: number; amountCents: number }) =>
    apiFetch<PhoneBalance>("/phone/balance/auto-topup", {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),

  // ── Usage ─────────────────────────────────────────────────────────────────
  getUsage: () => apiFetch<PhoneUsage>("/phone/usage"),
};
