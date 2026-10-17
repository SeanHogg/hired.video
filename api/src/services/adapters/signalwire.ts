/**
 * SignalWire service wrapper.
 *
 * SignalWire is Twilio-compatible, so the REST API surface is almost identical.
 * All env vars:
 *   SIGNALWIRE_SPACE_URL  — e.g. "yourspace.signalwire.com"
 *   SIGNALWIRE_PROJECT_ID — project/account SID
 *   SIGNALWIRE_AUTH_TOKEN — auth token
 *
 * These are optional — if absent, helpers return stubs so the app boots
 * cleanly in dev without phone credentials configured.
 */

// Shared XML text escaper (single source of truth — register gap #1942).
// Escapes the same `&`/`<`/`>`/`"`/`'` set the local copy did; the apostrophe
// is emitted as the numeric `&#39;` instead of `&apos;` — both parse to a
// literal `'` in any conformant XML parser (TwiML included), so the emitted
// `<Response>` document is semantically identical.
import { escapeXmlText as escapeXml } from "../../../../shared/course-cover.js";

import { getEnv } from "../../utils/env.js";

/** SignalWire credentials + webhook base, read from the Worker env. */
function signalwireConfig() {
  return {
    spaceUrl: getEnv("SIGNALWIRE_SPACE_URL"),
    projectId: getEnv("SIGNALWIRE_PROJECT_ID"),
    authToken: getEnv("SIGNALWIRE_AUTH_TOKEN"),
    webhookUrl: getEnv("WEBHOOK_BASE_URL") || getEnv("FRONTEND_URL"),
  };
}

function isConfigured(): boolean {
  const { spaceUrl, projectId, authToken } = signalwireConfig();
  return !!(spaceUrl && projectId && authToken);
}

function basicAuth(): string {
  const { projectId, authToken } = signalwireConfig();
  return "Basic " + btoa(`${projectId}:${authToken}`);
}

function apiUrl(path: string): string {
  const { spaceUrl, projectId } = signalwireConfig();
  return `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}${path}`;
}

/** Search available phone numbers in a country and area code. */
export async function searchAvailableNumbers(opts: {
  countryCode?: string;
  areaCode?: string;
  contains?: string;
}): Promise<Array<{ phoneNumber: string; friendlyName: string; locality: string | null }>> {
  if (!isConfigured()) {
    // Return mock numbers for dev/demo
    return [
      { phoneNumber: "+15551234567", friendlyName: "(555) 123-4567", locality: "San Francisco" },
      { phoneNumber: "+15559876543", friendlyName: "(555) 987-6543", locality: "New York" },
      { phoneNumber: "+15558887777", friendlyName: "(555) 888-7777", locality: "Austin" },
    ];
  }
  const country = opts.countryCode ?? "US";
  const params = new URLSearchParams();
  if (opts.areaCode) params.set("AreaCode", opts.areaCode);
  if (opts.contains) params.set("Contains", opts.contains);
  params.set("SmsEnabled", "true");
  params.set("VoiceEnabled", "true");
  params.set("PageSize", "10");

  const res = await fetch(
    apiUrl(`/AvailablePhoneNumbers/${country}/Local.json?${params}`),
    { headers: { Authorization: basicAuth() } },
  );
  if (!res.ok) throw new Error(`SignalWire search failed: ${res.status}`);
  const json = await res.json() as any;
  return (json.available_phone_numbers ?? []).map((n: any) => ({
    phoneNumber: n.phone_number,
    friendlyName: n.friendly_name,
    locality: n.locality ?? null,
  }));
}

/** Provision (purchase) a phone number. Returns the SID. */
export async function provisionNumber(opts: {
  phoneNumber: string;
  webhookBase: string;
}): Promise<{ sid: string; phoneNumber: string }> {
  if (!isConfigured()) {
    return { sid: `SW_STUB_${Date.now()}`, phoneNumber: opts.phoneNumber };
  }
  const body = new URLSearchParams({
    PhoneNumber: opts.phoneNumber,
    VoiceUrl:    `${opts.webhookBase}/api/phone/webhook/call`,
    VoiceMethod: "POST",
    SmsUrl:      `${opts.webhookBase}/api/phone/webhook/sms`,
    SmsMethod:   "POST",
  });
  const res = await fetch(apiUrl("/IncomingPhoneNumbers.json"), {
    method:  "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SignalWire provision failed: ${res.status} — ${err}`);
  }
  const json = await res.json() as any;
  return { sid: json.sid, phoneNumber: json.phone_number };
}

/** Release (delete) a provisioned phone number. */
export async function releaseNumber(sid: string): Promise<void> {
  if (!isConfigured() || sid.startsWith("SW_STUB_")) return;
  const res = await fetch(apiUrl(`/IncomingPhoneNumbers/${sid}.json`), {
    method:  "DELETE",
    headers: { Authorization: basicAuth() },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`SignalWire release failed: ${res.status}`);
  }
}

/**
 * Place an outbound call. Returns the call SID + initial status. The
 * `Url` parameter tells SignalWire which TwiML to fetch once the call
 * connects — we point it at our own `/api/phone/webhook/call` so the
 * existing inbound TwiML builder handles the bridge / record / VM flow.
 *
 * Used by the recruiter extension's "Call via hired.video" toggle so
 * outbound calls flow through the platform instead of the OS dialer.
 * Gap #1359 (Loxo-Boost-parity native VoIP).
 */
export async function placeCall(opts: {
  from: string;
  to:   string;
  webhookBase: string;
  record?: boolean;
}): Promise<{ sid: string; status: string }> {
  if (!isConfigured()) {
    return { sid: `STUB_CALL_${Date.now()}`, status: "queued" };
  }
  const body = new URLSearchParams({
    From: opts.from,
    To:   opts.to,
    Url:  `${opts.webhookBase}/api/phone/webhook/outbound-call`,
    StatusCallback: `${opts.webhookBase}/api/phone/webhook/call-status`,
    StatusCallbackEvent: "initiated ringing answered completed",
    StatusCallbackMethod: "POST",
  });
  if (opts.record) {
    body.set("Record", "true");
    body.set("RecordingStatusCallback", `${opts.webhookBase}/api/phone/webhook/recording`);
  }
  const res = await fetch(apiUrl("/Calls.json"), {
    method:  "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SignalWire call failed: ${res.status} — ${err}`);
  }
  const json = await res.json() as any;
  return { sid: json.sid, status: json.status ?? "queued" };
}

/**
 * Build TwiML returned to SignalWire when an outbound call connects.
 * Bridges the recruiter's caller ID to the destination and (optionally)
 * records the leg for the activity timeline.
 */
export function buildOutboundCallTwiML(opts: {
  to: string;
  record: boolean;
  callerId: string | null;
}): string {
  const recordAttrs = opts.record ? ` record="record-from-answer" recordingStatusCallback="/api/phone/webhook/recording"` : "";
  const callerIdAttr = opts.callerId ? ` callerId="${escapeXml(opts.callerId)}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30"${callerIdAttr}${recordAttrs}>${escapeXml(opts.to)}</Dial>
</Response>`;
}

/** Send an outbound SMS. Returns the message SID. */
export async function sendSms(opts: {
  from: string;
  to:   string;
  body: string;
}): Promise<string> {
  if (!isConfigured()) return `STUB_SMS_${Date.now()}`;
  const body = new URLSearchParams({ From: opts.from, To: opts.to, Body: opts.body });
  const res = await fetch(apiUrl("/Messages.json"), {
    method:  "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  if (!res.ok) throw new Error(`SignalWire SMS failed: ${res.status}`);
  const json = await res.json() as any;
  return json.sid;
}

/**
 * Generate TwiML for an inbound call.
 * If forwardingNumber is set: forward the call, optionally playing a greeting first.
 * If not set (or DND active): go to voicemail.
 */
export function buildCallTwiML(opts: {
  forwardingNumber: string | null;
  greetingText:     string | null;
  voicemailEnabled: boolean;
}): string {
  const { forwardingNumber, greetingText, voicemailEnabled } = opts;

  const greeting = greetingText
    ? `<Say voice="Polly.Joanna">${escapeXml(greetingText)}</Say>`
    : "";

  if (forwardingNumber) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greeting}
  <Dial timeout="30" action="/api/phone/webhook/call-status">${escapeXml(forwardingNumber)}</Dial>
  ${voicemailEnabled ? `<Say>The person you are trying to reach is unavailable. Please leave a message after the tone.</Say><Record maxLength="120" transcribe="false" action="/api/phone/webhook/recording"/>` : ""}
</Response>`;
  }

  if (voicemailEnabled) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greeting}
  <Say voice="Polly.Joanna">You have reached a hired.video business number. Please leave a message after the tone.</Say>
  <Record maxLength="120" transcribe="false" action="/api/phone/webhook/recording"/>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greeting}
  <Say voice="Polly.Joanna">This number is currently unavailable. Goodbye.</Say>
</Response>`;
}

/** Build TwiML acknowledgement for inbound SMS (empty 200 response). */
export function buildSmsTwiML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

export { isConfigured };
