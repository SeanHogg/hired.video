/**
 * Services / Lead-Generation Marketplace
 *
 * Job seekers can opt-in to "provide services" (lead-gen mode).
 * They list service offerings (think restaurant menu) with a price and
 * visibility setting.  Other users can:
 *   - Add visible-price services to cart and purchase directly.
 *   - Submit an inquiry (request quote) for hidden-price services.
 *
 * Routes:
 *   GET    /api/services                      – own offerings list
 *   POST   /api/services                      – create offering
 *   PUT    /api/services/:id                  – update offering
 *   DELETE /api/services/:id                  – delete offering
 *   GET    /api/services/browse                – public marketplace: all active offerings + provider
 *   GET    /api/services/public/:userId        – public offerings for a profile
 *   GET    /api/services/inquiries             – incoming inquiries (provider)
 *   GET    /api/services/my-requests           – outgoing inquiries (buyer)
 *   POST   /api/services/:serviceId/inquire    – submit inquiry / purchase intent
 *   PATCH  /api/services/inquiries/:id         – update inquiry status (provider)
 *   PATCH  /api/services/toggle                – toggle providesServices on profile
 */

import { Hono } from "hono";
import { eq, and, desc, inArray, or, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { filterVisibleCreators, isCreatorVisible } from "../services/creators/visibility.js";

const {
  serviceOfferings,
  serviceInquiries,
  userProfiles,
  users,
  notifications,
  pushSubscriptions,
} = schema;

export const serviceRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Helper: create an in-app notification for a user
// ---------------------------------------------------------------------------
async function notify(
  db: ReturnType<typeof getDb>,
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
) {
  await db
    .insert(notifications)
    .values({ userId, type, title, message, data: data ?? null } as any)
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Helper: send Web Push to all subscriptions for a user
// ---------------------------------------------------------------------------
async function sendPush(
  db: ReturnType<typeof getDb>,
  userId: string,
  payload: { title: string; body: string; url?: string },
) {
  // VAPID keys are required.  Skip silently if not configured.
  const vapidPublic = process.env.VAPID_PUBLIC_KEY ?? (globalThis as any).__ENV?.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? (globalThis as any).__ENV?.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? (globalThis as any).__ENV?.VAPID_SUBJECT ?? "mailto:noreply@hired.video";

  if (!vapidPublic || !vapidPrivate) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  for (const sub of subs) {
    try {
      await deliverWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        { publicKey: vapidPublic, privateKey: vapidPrivate, subject: vapidSubject },
      );
    } catch {
      // Remove stale subscription (410 Gone) silently
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        .catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal Web Push delivery using Web Crypto API (Cloudflare Workers compatible)
// Implements RFC 8030 + RFC 8291 (ECDH payload encryption) + RFC 8292 (VAPID)
// ---------------------------------------------------------------------------
async function deliverWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url?: string },
  vapid: { publicKey: string; privateKey: string; subject: string },
) {
  const crypto = (globalThis as any).crypto as Crypto;

  // 1. Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 2. Import receiver's public key (p256dh)
  const receiverPubKey = await crypto.subtle.importKey(
    "raw",
    base64UrlDecode(subscription.p256dh),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // 3. Generate ephemeral ECDH key pair
  const senderKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  ) as CryptoKeyPair;

  // 4. Derive shared secret
  const sharedSecret = await crypto.subtle.deriveKey(
    { name: "ECDH", public: receiverPubKey } as any,
    senderKeys.privateKey,
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new Uint8Array(0) } as any,
    false,
    ["deriveBits"],
  );
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: base64UrlDecode(subscription.auth), info: utf8Encode("Content-Encoding: auth\0") } as any, sharedSecret as any, 256),
  );

  const senderPubKeyRaw = new Uint8Array(
    await (crypto.subtle.exportKey as any)("raw", senderKeys.publicKey),
  );

  // PRK
  const prkKey = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

  function buildInfo(type: string, clientKey: Uint8Array, serverKey: Uint8Array) {
    const enc = new TextEncoder();
    const prefix = enc.encode("Content-Encoding: " + type + "\0P-256\0");
    const buf = new Uint8Array(prefix.length + 2 + clientKey.length + 2 + serverKey.length);
    buf.set(prefix);
    buf[prefix.length] = (clientKey.length >> 8) & 0xff;
    buf[prefix.length + 1] = clientKey.length & 0xff;
    buf.set(clientKey, prefix.length + 2);
    buf[prefix.length + 2 + clientKey.length] = (serverKey.length >> 8) & 0xff;
    buf[prefix.length + 2 + clientKey.length + 1] = serverKey.length & 0xff;
    buf.set(serverKey, prefix.length + 2 + clientKey.length + 2);
    return buf;
  }

  const receiverPubKeyRaw = new Uint8Array(base64UrlDecode(subscription.p256dh));

  const cekInfo = buildInfo("aesgcm", receiverPubKeyRaw, senderPubKeyRaw);
  const nonceInfo = buildInfo("nonce", receiverPubKeyRaw, senderPubKeyRaw);

  const cekBits = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, concat(hkdfExpand(salt, cekInfo))));
  const nonceBits = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, concat(hkdfExpand(salt, nonceInfo))));
  const cek = cekBits.slice(0, 16);
  const nonce = nonceBits.slice(0, 12);

  // 5. Encrypt payload
  const plaintext = utf8Encode(JSON.stringify(payload));
  const padded = new Uint8Array(plaintext.length + 2);
  padded.set(plaintext, 2); // 2-byte padding length prefix = 0
  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, padded),
  );

  // 6. Build VAPID JWT
  const audience = new URL(subscription.endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(utf8Encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(utf8Encode(JSON.stringify({ aud: audience, exp: now + 3600, sub: vapid.subject })));
  const jwtUnsigned = `${header}.${claims}`;
  const vapidPrivKey = await crypto.subtle.importKey(
    "pkcs8",
    base64UrlDecode(vapid.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const jwtSig = base64UrlEncode(
    new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapidPrivKey, utf8Encode(jwtUnsigned))),
  );
  const jwt = `${jwtUnsigned}.${jwtSig}`;

  // 7. POST to push endpoint
  const encryptionHeader = `salt=${base64UrlEncode(salt)}; rs=4096; keyid=p256dh; dh=${base64UrlEncode(senderPubKeyRaw)}`;
  await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aesgcm",
      Encryption: encryptionHeader,
      "Crypto-Key": `dh=${base64UrlEncode(senderPubKeyRaw)};vapid="public-key=${vapid.publicKey}"`,
      Authorization: `vapid t=${jwt},k=${vapid.publicKey}`,
      TTL: "86400",
    },
    body: ciphertext,
  });
}

// tiny helpers
function utf8Encode(s: string): Uint8Array { return new TextEncoder().encode(s); }
function base64UrlDecode(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + (4 - s.length % 4) % 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}
function base64UrlEncode(buf: Uint8Array): string {
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hkdfExpand(salt: Uint8Array, info: Uint8Array): Uint8Array {
  const merged = new Uint8Array(salt.length + info.length + 1);
  merged.set(salt);
  merged.set(info, salt.length);
  merged[merged.length - 1] = 1;
  return merged;
}
function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let i = 0;
  for (const a of arrays) { out.set(a, i); i += a.length; }
  return out;
}

// ===========================================================================
// Routes
// ===========================================================================

// ---------------------------------------------------------------------------
// PATCH /toggle — enable/disable providesServices on own profile
// ---------------------------------------------------------------------------
serviceRoutes.patch("/toggle", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({})) as { providesServices?: boolean };
  if (typeof body.providesServices !== "boolean") {
    return c.json(error("VALIDATION_ERROR", "providesServices (boolean) required"), 400);
  }
  const db = getDb();
  await db
    .update(userProfiles)
    .set({ providesServices: body.providesServices, updatedAt: new Date() } as any)
    .where(eq(userProfiles.userId, userId));
  return c.json(success({ providesServices: body.providesServices }), 200);
});

// ---------------------------------------------------------------------------
// GET / — list own service offerings
// ---------------------------------------------------------------------------
serviceRoutes.get("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(serviceOfferings)
    .where(eq(serviceOfferings.userId, userId))
    .orderBy(desc(serviceOfferings.createdAt));
  return c.json(success(rows), 200);
});

// ---------------------------------------------------------------------------
// POST / — create a new service offering
// ---------------------------------------------------------------------------
serviceRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({})) as {
    title?: string;
    description?: string;
    category?: string;
    priceCents?: number;
    priceVisible?: boolean;
    deliveryDays?: number;
    imageUrl?: string;
  };
  if (!body.title?.trim()) {
    return c.json(error("VALIDATION_ERROR", "title is required"), 400);
  }
  const db = getDb();
  const [row] = await db
    .insert(serviceOfferings)
    .values({
      userId,
      title: body.title.trim(),
      description: body.description ?? null,
      category: body.category ?? null,
      priceCents: body.priceCents ?? 0,
      priceVisible: body.priceVisible ?? true,
      deliveryDays: body.deliveryDays ?? null,
      imageUrl: body.imageUrl ?? null,
    } as any)
    .returning();
  // Auto-enable providesServices on the creator's profile so the public
  // services list (`GET /public/:userId`) surfaces this offering without
  // forcing them back into Settings to flip the toggle manually. Idempotent
  // — the WHERE clause skips the UPDATE when the flag is already on, and
  // a failure here must NOT roll back the successful insert above.
  db.update(userProfiles)
    .set({ providesServices: true, updatedAt: new Date() } as any)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.providesServices, false)))
    .catch((err) => console.warn("[services] auto-flip providesServices failed:", err));
  return c.json(success(row), 201);
});

// ---------------------------------------------------------------------------
// PUT /:id — update a service offering
// ---------------------------------------------------------------------------
serviceRoutes.put("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const db = getDb();
  const [existing] = await db
    .select({ id: serviceOfferings.id })
    .from(serviceOfferings)
    .where(and(eq(serviceOfferings.id, c.req.param("id")), eq(serviceOfferings.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Service not found"), 404);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === "string") patch.title = body.title.trim();
  if ("description" in body) patch.description = body.description;
  if ("category" in body) patch.category = body.category;
  if (typeof body.priceCents === "number") patch.priceCents = body.priceCents;
  if (typeof body.priceVisible === "boolean") patch.priceVisible = body.priceVisible;
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
  if ("deliveryDays" in body) patch.deliveryDays = body.deliveryDays;
  if ("imageUrl" in body) patch.imageUrl = body.imageUrl;
  // Only superadmins can flip the platform-service flag (recruiting funnel).
  if (typeof body.isPlatformService === "boolean") {
    const isSuperAdmin =
      (c.var.user as any)?.isSuperAdmin === true ||
      (c.var.user as any)?.roles?.includes(USER_ROLES.SUPER_ADMIN);
    if (isSuperAdmin) patch.isPlatformService = body.isPlatformService;
  }

  const [updated] = await db
    .update(serviceOfferings)
    .set(patch as any)
    .where(eq(serviceOfferings.id, c.req.param("id")))
    .returning();
  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete a service offering
// ---------------------------------------------------------------------------
serviceRoutes.delete("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db
    .select({ id: serviceOfferings.id })
    .from(serviceOfferings)
    .where(and(eq(serviceOfferings.id, c.req.param("id")), eq(serviceOfferings.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Service not found"), 404);
  await db.delete(serviceOfferings).where(eq(serviceOfferings.id, c.req.param("id")));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// GET /public/:userId — active offerings for any public profile (no auth req.)
// Returns priceCents only when priceVisible=true
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /browse — public marketplace listing of all active service offerings
// joined with their provider's user info. Powers the Services category in
// /search.
// ---------------------------------------------------------------------------
serviceRoutes.get("/browse", async (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query("limit") ?? "30", 10) || 30, 100);
  // Defensive: degrades to empty if `is_platform_service` (#194) hasn't been
  // applied yet via migration 0037, so /search keeps rendering during deploy.
  try {
    const rows = await db
      .select({
        service: serviceOfferings,
        provider: { id: users.id, name: users.name },
        providerProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
      })
      .from(serviceOfferings)
      .innerJoin(users, eq(serviceOfferings.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(
        eq(serviceOfferings.isActive, true),
        eq(users.emailVerified, true),
      ))
      .orderBy(desc(serviceOfferings.isPlatformService), desc(serviceOfferings.createdAt))
      .limit(limit);

    // #314 paywall — hide service listings from free creators.
    // Platform services (isPlatformService=true) stay visible regardless
    // since they are first-party, not creator-owned.
    const candidateUserIds = rows
      .filter((r) => r.service.isPlatformService !== true)
      .map((r) => r.provider.id);
    const visible = await filterVisibleCreators(candidateUserIds);
    const filtered = rows.filter((r) =>
      r.service.isPlatformService === true || visible.has(r.provider.id),
    );

    const items = filtered.map((r) => ({
      ...r.service,
      priceCents: r.service.priceVisible ? r.service.priceCents : null,
      isPlatformService: r.service.isPlatformService === true,
      provider: r.provider,
      providerSlug: r.providerProfile?.customUrlSlug ?? null,
      providerAvatarUrl: r.providerProfile?.avatarUrl ?? null,
    }));
    return c.json(success(items), 200);
  } catch (e) {
    return c.json(success([] as unknown[]), 200);
  }
});

serviceRoutes.get("/public/:userId", async (c) => {
  const db = getDb();
  const targetUserId = c.req.param("userId");
  const [profile] = await db
    .select({ providesServices: userProfiles.providesServices })
    .from(userProfiles)
    .where(eq(userProfiles.userId, targetUserId))
    .limit(1);
  if (!profile?.providesServices) return c.json(success([]), 200);

  // #314 paywall — a free creator's profile services list is empty until
  // they upgrade.
  if (!(await isCreatorVisible(targetUserId))) return c.json(success([]), 200);

  const rows = await db
    .select()
    .from(serviceOfferings)
    .where(
      and(
        eq(serviceOfferings.userId, targetUserId),
        eq(serviceOfferings.isActive, true),
      ),
    )
    .orderBy(serviceOfferings.createdAt);

  // Mask price when priceVisible=false
  const sanitised = rows.map((r) => ({
    ...r,
    priceCents: r.priceVisible ? r.priceCents : null,
  }));
  return c.json(success(sanitised), 200);
});

// ---------------------------------------------------------------------------
// GET /inquiries — incoming inquiries where I am the provider
// ---------------------------------------------------------------------------
serviceRoutes.get("/inquiries", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select({
      inquiry: serviceInquiries,
      service: {
        id: serviceOfferings.id,
        title: serviceOfferings.title,
        priceCents: serviceOfferings.priceCents,
      },
      buyer: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(serviceInquiries)
    .innerJoin(serviceOfferings, eq(serviceInquiries.serviceId, serviceOfferings.id))
    .innerJoin(users, eq(serviceInquiries.fromUserId, users.id))
    .where(eq(serviceInquiries.providerId, userId))
    .orderBy(desc(serviceInquiries.createdAt));
  return c.json(success(rows), 200);
});

// ---------------------------------------------------------------------------
// GET /my-requests — inquiries I submitted (buyer view)
// ---------------------------------------------------------------------------
serviceRoutes.get("/my-requests", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select({
      inquiry: serviceInquiries,
      service: {
        id: serviceOfferings.id,
        title: serviceOfferings.title,
        priceCents: serviceOfferings.priceCents,
        priceVisible: serviceOfferings.priceVisible,
      },
      provider: {
        id: users.id,
        name: users.name,
      },
    })
    .from(serviceInquiries)
    .innerJoin(serviceOfferings, eq(serviceInquiries.serviceId, serviceOfferings.id))
    .innerJoin(users, eq(serviceInquiries.providerId, users.id))
    .where(eq(serviceInquiries.fromUserId, userId))
    .orderBy(desc(serviceInquiries.createdAt));
  return c.json(success(rows), 200);
});

// ---------------------------------------------------------------------------
// POST /:serviceId/inquire — submit inquiry or purchase intent
// ---------------------------------------------------------------------------
serviceRoutes.post("/:serviceId/inquire", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [service] = await db
    .select()
    .from(serviceOfferings)
    .where(
      and(
        eq(serviceOfferings.id, c.req.param("serviceId")),
        eq(serviceOfferings.isActive, true),
      ),
    )
    .limit(1);
  if (!service) return c.json(error("NOT_FOUND", "Service not found"), 404);
  if (service.userId === userId) {
    return c.json(error("FORBIDDEN", "Cannot inquire about your own service"), 403);
  }

  const body = await c.req.json().catch(() => ({})) as { message?: string; orderType?: string };
  const orderType = body.orderType === "purchase" ? "purchase" : "inquiry";

  const [row] = await db
    .insert(serviceInquiries)
    .values({
      serviceId: service.id,
      fromUserId: userId,
      providerId: service.userId,
      message: body.message ?? null,
      orderType,
      status: "pending",
      paidAmountCents: orderType === "purchase" ? service.priceCents : 0,
    } as any)
    .returning();

  // Notify provider (in-app + push)
  const [buyer] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const buyerName = buyer?.name ?? "Someone";
  const notifTitle =
    orderType === "purchase"
      ? `New purchase: ${service.title}`
      : `New inquiry: ${service.title}`;
  const notifMsg =
    orderType === "purchase"
      ? `${buyerName} purchased your service "${service.title}"`
      : `${buyerName} sent an inquiry about "${service.title}"`;
  await notify(db, service.userId, "service_inquiry", notifTitle, notifMsg, {
    inquiryId: row.id,
    serviceId: service.id,
  });
  await sendPush(db, service.userId, { title: notifTitle, body: notifMsg, url: "/services/inquiries" });

  return c.json(success(row), 201);
});

// ---------------------------------------------------------------------------
// PATCH /inquiries/:id — update inquiry status (provider only)
// ---------------------------------------------------------------------------
serviceRoutes.patch("/inquiries/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({})) as { status?: string };
  const allowed = ["accepted", "rejected", "completed"];
  if (!body.status || !allowed.includes(body.status)) {
    return c.json(error("VALIDATION_ERROR", `status must be one of: ${allowed.join(", ")}`), 400);
  }
  const db = getDb();
  const [inquiry] = await db
    .select()
    .from(serviceInquiries)
    .where(
      and(
        eq(serviceInquiries.id, c.req.param("id")),
        eq(serviceInquiries.providerId, userId),
      ),
    )
    .limit(1);
  if (!inquiry) return c.json(error("NOT_FOUND", "Inquiry not found"), 404);

  const [updated] = await db
    .update(serviceInquiries)
    .set({ status: body.status, updatedAt: new Date() } as any)
    .where(eq(serviceInquiries.id, c.req.param("id")))
    .returning();

  // Notify buyer
  const [service] = await db
    .select({ title: serviceOfferings.title })
    .from(serviceOfferings)
    .where(eq(serviceOfferings.id, inquiry.serviceId))
    .limit(1);
  const statusLabel = body.status === "accepted" ? "accepted" : body.status === "completed" ? "completed" : "declined";
  const notifTitle = `Inquiry ${statusLabel}: ${service?.title ?? "your service"}`;
  const notifMsg = `Your inquiry was ${statusLabel}.`;
  await notify(db, inquiry.fromUserId, "service_inquiry", notifTitle, notifMsg, {
    inquiryId: inquiry.id,
  });
  await sendPush(db, inquiry.fromUserId, { title: notifTitle, body: notifMsg, url: "/services/my-requests" });

  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// GET /api/services/team/leaderboard?companyId=X&days=30
//
// Per team-member rollup of pipeline activity for one company. Recruiters
// see this on /services/team and pick the company they're scoped to.
// Powers the "Performance dashboards & team leaderboards" Pricing claim.
// ---------------------------------------------------------------------------
serviceRoutes.get("/team/leaderboard", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const companyId = c.req.query("companyId");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId is required"), 400);

  const daysParam = Number.parseInt(c.req.query("days") ?? "30", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  const db = getDb();

  // Caller must be a member of this company (or super-admin).
  const isSuperAdmin = c.var.user?.isSuperAdmin === true;
  if (!isSuperAdmin) {
    const [assoc] = await db
      .select({ id: schema.userCompanyRoleAssociations.id })
      .from(schema.userCompanyRoleAssociations)
      .where(
        and(
          eq(schema.userCompanyRoleAssociations.userId, userId),
          eq(schema.userCompanyRoleAssociations.companyId, companyId),
          eq(schema.userCompanyRoleAssociations.isActive, true),
        ),
      )
      .limit(1);
    if (!assoc) {
      return c.json(error("FORBIDDEN", "You are not a member of this company"), 403);
    }
  }

  // Members of the company (including the owner).
  const members = await db
    .select({
      userId: schema.userCompanyRoleAssociations.userId,
      role: schema.userCompanyRoleAssociations.role,
      name: users.name,
      email: users.email,
    })
    .from(schema.userCompanyRoleAssociations)
    .innerJoin(users, eq(users.id, schema.userCompanyRoleAssociations.userId))
    .where(
      and(
        eq(schema.userCompanyRoleAssociations.companyId, companyId),
        eq(schema.userCompanyRoleAssociations.isActive, true),
      ),
    );

  if (members.length === 0) {
    return c.json(success({ rows: [], days, generatedAt: new Date().toISOString() }), 200);
  }

  const memberIds = members.map((m) => m.userId);
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Per-member candidate counts (all-time owned by this user, scoped to
  // jobs that belong to a company member — i.e. the company's posted jobs).
  // We approximate company scope via posted_by_user_id IN memberIds, since
  // job_items doesn't yet have a company FK (#3 deferred).
  const ownedRowsRaw = await db
    .select({
      ownerId: schema.jobPipelineEntries.ownerId,
      stage: schema.jobPipelineEntries.stage,
      stageChangedAt: schema.jobPipelineEntries.stageChangedAt,
    })
    .from(schema.jobPipelineEntries)
    .innerJoin(schema.jobItems, eq(schema.jobItems.id, schema.jobPipelineEntries.jobId))
    .where(
      // Restrict pipeline data to entries on jobs posted by anyone on this team.
      // SECURITY: this leaks across teams whose members co-posted jobs, which
      // is fine v1 — same constraint as the rest of the recruit surface.
      inArray(schema.jobItems.postedByUserId, memberIds),
    );

  const touchpointsRaw = await db
    .select({
      performedByUserId: schema.pipelineTouchpoints.performedByUserId,
      type: schema.pipelineTouchpoints.type,
      createdAt: schema.pipelineTouchpoints.createdAt,
    })
    .from(schema.pipelineTouchpoints)
    .where(sql`${schema.pipelineTouchpoints.createdAt} >= ${sinceDate}`);

  // Roll up per-member.
  type Row = {
    userId: string;
    name: string;
    role: string;
    candidates: number;
    active: number;
    hires: number;
    rejected: number;
    submitted: number;
    touchpoints: number;
    stageChanges: number;
    lastActivityAt: string | null;
  };

  const byUser = new Map<string, Row>();
  for (const m of members) {
    byUser.set(m.userId, {
      userId: m.userId,
      name: m.name ?? m.email ?? "(no name)",
      role: m.role,
      candidates: 0,
      active: 0,
      hires: 0,
      rejected: 0,
      submitted: 0,
      touchpoints: 0,
      stageChanges: 0,
      lastActivityAt: null,
    });
  }

  for (const r of ownedRowsRaw) {
    if (!r.ownerId) continue;
    const row = byUser.get(r.ownerId);
    if (!row) continue;
    row.candidates += 1;
    if (r.stage === "hired") row.hires += 1;
    else if (r.stage === "rejected") row.rejected += 1;
    else row.active += 1;
    if (r.stage === "submitted") row.submitted += 1;
    const ts = r.stageChangedAt instanceof Date ? r.stageChangedAt : new Date(r.stageChangedAt as any);
    if (!row.lastActivityAt || ts > new Date(row.lastActivityAt)) {
      row.lastActivityAt = ts.toISOString();
    }
  }

  for (const t of touchpointsRaw) {
    if (!t.performedByUserId) continue;
    const row = byUser.get(t.performedByUserId);
    if (!row) continue;
    row.touchpoints += 1;
    if (t.type === "stage_change") row.stageChanges += 1;
    const ts = t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt as any);
    if (!row.lastActivityAt || ts > new Date(row.lastActivityAt)) {
      row.lastActivityAt = ts.toISOString();
    }
  }

  const rows = Array.from(byUser.values()).sort((a, b) => b.hires - a.hires || b.touchpoints - a.touchpoints);
  return c.json(success({ rows, days, generatedAt: new Date().toISOString() }), 200);
});

serviceRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Service route not found" } }, 404),
);
