/**
 * Server-side Conversions API fan-out.
 *
 * Every conversion captured by routes/middleware (signup, paid upgrade,
 * lead, etc.) is written to `paid_media_conversions` and then mirrored
 * to every pixel/CAPI configured for the workspace. Each platform call
 * is fire-and-forget at the request layer (delivery results are
 * persisted on the conversion row) — never let a pixel outage block a
 * signup.
 *
 * Why server-side: post-iOS 14 / ad-blocker / tracking-prevention era,
 * client-only pixels miss 30-60% of conversions. Sending the event from
 * our backend + advanced matching (hashed email/phone/external_id +
 * click IDs captured at landing) recovers most of that.
 *
 * All PII hashing uses SHA-256 of the normalised value (lowercased,
 * trimmed). Phone normalisation strips non-digits.
 */

import type { getDb } from "../../../db/index.js";
import { schema } from "../../../db/index.js";
import { PaidMediaPixelsRepository } from "../../../repositories/paidMediaPixelsRepository.js";
import { decryptSecret } from "../secrets.js";
import { linkedInApiVersion } from "../../../utils/linkedin-version.js";
import { sha256Hex } from "../../../utils/crypto.js";

type DbHandle = ReturnType<typeof getDb>;

export interface ConversionEvent {
  /** Identity of the workspace whose pixels fire for this event. */
  workspaceUserId: string;
  workspaceCompanyId: string | null;
  /** The hired.video user converting (if known). */
  userId?: string | null;

  eventName: string;          // signup | paid_upgrade | lead | content_view | ...
  eventTime?: Date;
  valueCents?: number | null;
  currencyCode?: string;

  /** Click IDs captured by middleware/click-id-capture.ts on landing. */
  clickIds?: {
    fbclid?: string | null;
    gclid?: string | null;
    liFatId?: string | null;
    ttclid?: string | null;
    msclkid?: string | null;
  };
  /** Raw user PII — hashed before send. Never persisted in plaintext. */
  userData?: {
    email?: string | null;
    phone?: string | null;
    externalId?: string | null;  // typically the hired.video user id
  };
  ipAddress?: string | null;
  userAgent?: string | null;
  sourceUrl?: string | null;
  properties?: Record<string, unknown>;
}

export type DeliveryStatus = "sent" | "skipped" | "failed";
export type DeliveryResults = Partial<Record<"meta" | "google" | "linkedin" | "tiktok" | "bing", DeliveryStatus | { status: DeliveryStatus; error?: string }>>;

interface CapiEnv {
  PAID_MEDIA_KMS_KEY?: string;
}


function normaliseEmail(s: string): string { return s.trim().toLowerCase(); }
function normalisePhone(s: string): string { return s.replace(/\D/g, ""); }

async function hashOptional(value: string | null | undefined, normalise: (s: string) => string): Promise<string | undefined> {
  if (!value) return undefined;
  return sha256Hex(normalise(value));
}

// ── Meta CAPI ──────────────────────────────────────────────────────────────
async function sendMeta(env: CapiEnv, pixel: typeof schema.paidMediaPixels.$inferSelect, ev: ConversionEvent): Promise<DeliveryStatus | { status: DeliveryStatus; error?: string }> {
  if (!pixel.metaPixelId || !pixel.metaCapiTokenEnc) return "skipped";
  const accessToken = await decryptSecret(env, pixel.metaCapiTokenEnc);
  const payload = {
    data: [{
      event_name: ev.eventName,
      event_time: Math.floor((ev.eventTime ?? new Date()).getTime() / 1000),
      action_source: "website",
      event_source_url: ev.sourceUrl,
      user_data: {
        em:        ev.userData?.email      ? [await sha256Hex(normaliseEmail(ev.userData.email))]      : undefined,
        ph:        ev.userData?.phone      ? [await sha256Hex(normalisePhone(ev.userData.phone))]      : undefined,
        external_id: ev.userData?.externalId ? [await sha256Hex(ev.userData.externalId)] : undefined,
        fbc:       ev.clickIds?.fbclid     ? `fb.1.${Date.now()}.${ev.clickIds.fbclid}` : undefined,
        client_ip_address: ev.ipAddress ?? undefined,
        client_user_agent: ev.userAgent ?? undefined,
      },
      custom_data: {
        currency: ev.currencyCode ?? "USD",
        value:    ev.valueCents != null ? ev.valueCents / 100 : undefined,
        ...ev.properties,
      },
    }],
  };
  const res = await fetch(`https://graph.facebook.com/v19.0/${pixel.metaPixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { status: "failed", error: `Meta CAPI ${res.status}` };
  return "sent";
}

// ── Google Ads Enhanced Conversions (via Measurement Protocol GA4) ────────
async function sendGoogle(env: CapiEnv, pixel: typeof schema.paidMediaPixels.$inferSelect, ev: ConversionEvent): Promise<DeliveryStatus | { status: DeliveryStatus; error?: string }> {
  if (!pixel.ga4MeasurementId || !pixel.ga4ApiSecretEnc) return "skipped";
  const apiSecret = await decryptSecret(env, pixel.ga4ApiSecretEnc);
  const clientId = ev.userData?.externalId ?? crypto.randomUUID();
  const payload = {
    client_id: clientId,
    events: [{
      name: ev.eventName,
      params: {
        currency: ev.currencyCode ?? "USD",
        value:    ev.valueCents != null ? ev.valueCents / 100 : undefined,
        gclid:    ev.clickIds?.gclid ?? undefined,
        ...ev.properties,
      },
    }],
    user_data: {
      sha256_email_address: ev.userData?.email ? await sha256Hex(normaliseEmail(ev.userData.email)) : undefined,
      sha256_phone_number:  ev.userData?.phone ? `+${await sha256Hex(normalisePhone(ev.userData.phone))}` : undefined,
    },
  };
  const res = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(pixel.ga4MeasurementId)}&api_secret=${encodeURIComponent(apiSecret)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { status: "failed", error: `GA4 MP ${res.status}` };
  return "sent";
}

// ── LinkedIn Conversions API ──────────────────────────────────────────────
async function sendLinkedIn(env: CapiEnv, pixel: typeof schema.paidMediaPixels.$inferSelect, ev: ConversionEvent): Promise<DeliveryStatus | { status: DeliveryStatus; error?: string }> {
  if (!pixel.linkedInPartnerId || !pixel.linkedInCapiTokenEnc) return "skipped";
  const accessToken = await decryptSecret(env, pixel.linkedInCapiTokenEnc);
  const conversionRule = (ev.properties?.linkedInConversionRule as string) ?? null;
  if (!conversionRule) return "skipped"; // LinkedIn CAPI needs a pre-created conversion rule URN
  const payload = {
    conversion:       conversionRule, // urn:lla:llaPartnerConversion:<id>
    conversionHappenedAt: (ev.eventTime ?? new Date()).getTime(),
    conversionValue:  ev.valueCents != null ? { currencyCode: ev.currencyCode ?? "USD", amount: String(ev.valueCents / 100) } : undefined,
    eventId:          crypto.randomUUID(),
    user: {
      userIds: [
        ev.userData?.email ? { idType: "SHA256_EMAIL", idValue: await sha256Hex(normaliseEmail(ev.userData.email)) } : null,
        ev.clickIds?.liFatId ? { idType: "LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID", idValue: ev.clickIds.liFatId } : null,
      ].filter(Boolean),
      userInfo: { countryCode: ev.properties?.countryCode },
    },
  };
  const res = await fetch("https://api.linkedin.com/rest/conversionEvents", {
    method: "POST",
    headers: {
      Authorization:       `Bearer ${accessToken}`,
      "Content-Type":      "application/json",
      "LinkedIn-Version":  linkedInApiVersion(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { status: "failed", error: `LinkedIn CAPI ${res.status}` };
  return "sent";
}

// ── TikTok Events API ─────────────────────────────────────────────────────
async function sendTikTok(env: CapiEnv, pixel: typeof schema.paidMediaPixels.$inferSelect, ev: ConversionEvent): Promise<DeliveryStatus | { status: DeliveryStatus; error?: string }> {
  if (!pixel.tiktokPixelId || !pixel.tiktokAccessTokenEnc) return "skipped";
  const accessToken = await decryptSecret(env, pixel.tiktokAccessTokenEnc);
  const payload = {
    event_source:    "web",
    event_source_id: pixel.tiktokPixelId,
    data: [{
      event:       ev.eventName,
      event_time:  Math.floor((ev.eventTime ?? new Date()).getTime() / 1000),
      event_id:    crypto.randomUUID(),
      user: {
        email:        ev.userData?.email      ? await sha256Hex(normaliseEmail(ev.userData.email)) : undefined,
        phone:        ev.userData?.phone      ? await sha256Hex(normalisePhone(ev.userData.phone)) : undefined,
        external_id:  ev.userData?.externalId ? await sha256Hex(ev.userData.externalId) : undefined,
        ttclid:       ev.clickIds?.ttclid ?? undefined,
        ip:           ev.ipAddress ?? undefined,
        user_agent:   ev.userAgent ?? undefined,
      },
      properties: {
        currency: ev.currencyCode ?? "USD",
        value:    ev.valueCents != null ? ev.valueCents / 100 : undefined,
        ...ev.properties,
      },
      page: { url: ev.sourceUrl },
    }],
  };
  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Access-Token": accessToken },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { status: "failed", error: `TikTok Events ${res.status}` };
  const body = await res.json() as { code?: number; message?: string };
  if (body.code !== 0) return { status: "failed", error: `TikTok Events code=${body.code}: ${body.message}` };
  return "sent";
}

// ── Bing UET (Universal Event Tracking) Conversions API ──────────────────
async function sendBing(env: CapiEnv, pixel: typeof schema.paidMediaPixels.$inferSelect, ev: ConversionEvent): Promise<DeliveryStatus | { status: DeliveryStatus; error?: string }> {
  if (!pixel.bingUetTagId || !pixel.bingUetApiTokenEnc) return "skipped";
  const apiToken = await decryptSecret(env, pixel.bingUetApiTokenEnc);
  // Microsoft Advertising's UET API expects a JSON event collection.
  // See: https://learn.microsoft.com/en-us/advertising/guides/universal-event-tracking
  const payload = {
    events: [{
      tagId:       pixel.bingUetTagId,
      eventTime:   (ev.eventTime ?? new Date()).toISOString(),
      eventName:   ev.eventName,
      eventValue:  ev.valueCents != null ? ev.valueCents / 100 : undefined,
      eventCurrency: ev.currencyCode ?? "USD",
      msclkid:     ev.clickIds?.msclkid ?? undefined,
      userAgent:   ev.userAgent ?? undefined,
      clientIp:    ev.ipAddress ?? undefined,
      pageUrl:     ev.sourceUrl ?? undefined,
      enhancedConversionsData: {
        sha256EmailAddress: ev.userData?.email ? await sha256Hex(normaliseEmail(ev.userData.email)) : undefined,
        sha256PhoneNumber:  ev.userData?.phone ? await sha256Hex(normalisePhone(ev.userData.phone)) : undefined,
      },
    }],
  };
  const res = await fetch("https://uet.atdmt.com/conversions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { status: "failed", error: `Bing UET ${res.status}` };
  return "sent";
}

// ── Orchestrator ──────────────────────────────────────────────────────────
export interface RecordConversionDeps {
  db: DbHandle;
  env: CapiEnv;
  /** Override individual platform sends in tests. */
  sender?: {
    meta?:    typeof sendMeta;
    google?:  typeof sendGoogle;
    linkedin?: typeof sendLinkedIn;
    tiktok?:  typeof sendTikTok;
    bing?:    typeof sendBing;
  };
}

/** Record a conversion + fan out to every configured pixel. Persists
 *  the event row AFTER all platform calls so delivery_results is
 *  populated. Never throws — failures are recorded in delivery_results
 *  so the calling route never breaks because of a pixel outage. */
export async function recordConversion(deps: RecordConversionDeps, ev: ConversionEvent): Promise<{ id: string; delivery: DeliveryResults }> {
  // Personal workspaces match companyId IS NULL — the old predicate repeated
  // the userId test, so a personal conversion could fan out through one of
  // the user's company pixel rows.
  const pixel = await new PaidMediaPixelsRepository(deps.db)
    .findForOwner(ev.workspaceUserId, ev.workspaceCompanyId ?? null);
  const delivery: DeliveryResults = {};

  if (pixel) {
    const sends: Array<[keyof DeliveryResults, Promise<DeliveryStatus | { status: DeliveryStatus; error?: string }>]> = [
      ["meta",     (deps.sender?.meta     ?? sendMeta)(deps.env, pixel, ev)],
      ["google",   (deps.sender?.google   ?? sendGoogle)(deps.env, pixel, ev)],
      ["linkedin", (deps.sender?.linkedin ?? sendLinkedIn)(deps.env, pixel, ev)],
      ["tiktok",   (deps.sender?.tiktok   ?? sendTikTok)(deps.env, pixel, ev)],
      ["bing",     (deps.sender?.bing     ?? sendBing)(deps.env, pixel, ev)],
    ];
    const settled = await Promise.allSettled(sends.map(([, p]) => p));
    settled.forEach((r, i) => {
      const key = sends[i][0];
      if (r.status === "fulfilled") delivery[key] = r.value;
      else delivery[key] = { status: "failed", error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    });
  }

  const [row] = await deps.db
    .insert(schema.paidMediaConversions)
    .values({
      userId:             ev.userId ?? null,
      workspaceUserId:    ev.workspaceUserId,
      workspaceCompanyId: ev.workspaceCompanyId,
      eventName:          ev.eventName,
      eventTime:          ev.eventTime ?? new Date(),
      valueCents:         ev.valueCents ?? null,
      currencyCode:       ev.currencyCode ?? "USD",
      fbclid:             ev.clickIds?.fbclid ?? null,
      gclid:              ev.clickIds?.gclid ?? null,
      liFatId:            ev.clickIds?.liFatId ?? null,
      ttclid:             ev.clickIds?.ttclid ?? null,
      msclkid:            ev.clickIds?.msclkid ?? null,
      emailHashed:        await hashOptional(ev.userData?.email, normaliseEmail),
      phoneHashed:        await hashOptional(ev.userData?.phone, normalisePhone),
      externalIdHashed:   await hashOptional(ev.userData?.externalId, (s) => s),
      ipAddress:          ev.ipAddress ?? null,
      userAgent:          ev.userAgent ?? null,
      sourceUrl:          ev.sourceUrl ?? null,
      properties:         ev.properties ?? {},
      deliveryResults:    delivery,
    } as any)
    .returning({ id: schema.paidMediaConversions.id });

  return { id: row!.id, delivery };
}
