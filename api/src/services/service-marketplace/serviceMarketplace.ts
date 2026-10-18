/**
 * Services / lead-generation marketplace use cases. Job seekers opt in to
 * "provide services" and list offerings (price + visibility); other users
 * purchase visible-price offerings or send an inquiry (request a quote).
 *
 * Rules + notifications live here; rows go through
 * repositories/serviceMarketplaceRepository.ts and the providesServices
 * flag through repositories/usersProfileRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import {
  deleteOffering,
  findActiveOffering,
  findOfferingTitle,
  findProviderInquiry,
  insertInquiry,
  insertOffering,
  isOfferingOwnedBy,
  listActiveOfferingsByOwner,
  listBrowseOfferings,
  listIncomingInquiries,
  listOutgoingInquiries,
  listOfferingsByOwner,
  updateInquiryStatus,
  updateOffering,
  type ServiceOfferingPatch,
} from "../../repositories/serviceMarketplaceRepository.js";
import {
  enableProvidesServicesIfOff,
  findIdentity,
  findProvidesServices,
  setProvidesServices,
} from "../../repositories/usersProfileRepository.js";
import { filterVisibleCreators, isCreatorVisible } from "../creators/visibility.js";
import { NotificationService } from "../notifications/notificationService.js";

const notFound = (what: string) => new DomainError(404, "NOT_FOUND", `${what} not found`);

/** Price is hidden (null) unless the provider made it visible. */
function maskPrice<T extends { priceVisible: boolean | null; priceCents: number | null }>(row: T) {
  return { ...row, priceCents: row.priceVisible ? row.priceCents : null };
}

// ── Provider flag ───────────────────────────────────────────────────────────

export async function toggleProvidesServices(userId: string, providesServices: unknown): Promise<{ providesServices: boolean }> {
  if (typeof providesServices !== "boolean") {
    throw new DomainError(400, "VALIDATION_ERROR", "providesServices (boolean) required");
  }
  await setProvidesServices(userId, providesServices);
  return { providesServices };
}

// ── Offerings (owner) ───────────────────────────────────────────────────────

export function listOwnOfferings(userId: string) {
  return listOfferingsByOwner(getDb(), userId);
}

export interface CreateOfferingInput {
  title?: string;
  description?: string;
  category?: string;
  priceCents?: number;
  priceVisible?: boolean;
  deliveryDays?: number;
  imageUrl?: string;
}

export async function createOffering(userId: string, body: CreateOfferingInput) {
  const title = body.title?.trim();
  if (!title) throw new DomainError(400, "VALIDATION_ERROR", "title is required");
  const row = await insertOffering(getDb(), {
    userId,
    title,
    description: body.description ?? null,
    category: body.category ?? null,
    priceCents: body.priceCents ?? 0,
    priceVisible: body.priceVisible ?? true,
    deliveryDays: body.deliveryDays ?? null,
    imageUrl: body.imageUrl ?? null,
  });
  // Auto-enable providesServices so the public services list surfaces this
  // offering without a trip to Settings. Idempotent; a failure here must NOT
  // roll back the successful insert above (fire-and-forget).
  enableProvidesServicesIfOff(userId).catch((err) =>
    logger.warn("[services] auto-flip providesServices failed", err),
  );
  return row;
}

export async function updateOwnOffering(
  userId: string,
  offeringId: string,
  body: Record<string, unknown>,
  canSetPlatformFlag: boolean,
) {
  const db = getDb();
  if (!(await isOfferingOwnedBy(db, offeringId, userId))) throw notFound("Service");

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
  if (typeof body.isPlatformService === "boolean" && canSetPlatformFlag) {
    patch.isPlatformService = body.isPlatformService;
  }
  return updateOffering(db, offeringId, patch as ServiceOfferingPatch);
}

export async function deleteOwnOffering(userId: string, offeringId: string): Promise<void> {
  const db = getDb();
  if (!(await isOfferingOwnedBy(db, offeringId, userId))) throw notFound("Service");
  await deleteOffering(db, offeringId);
}

// ── Public listings ─────────────────────────────────────────────────────────

/** Marketplace listing of active offerings with provider info (/search). */
export async function browseOfferings(limit: number) {
  const rows = await listBrowseOfferings(getDb(), limit);
  // #314 paywall — hide service listings from free creators. Platform
  // services stay visible regardless (first-party, not creator-owned).
  const visible = await filterVisibleCreators(
    rows.filter((r) => r.service.isPlatformService !== true).map((r) => r.provider.id),
  );
  return rows
    .filter((r) => r.service.isPlatformService === true || visible.has(r.provider.id))
    .map((r) => ({
      ...maskPrice(r.service),
      isPlatformService: r.service.isPlatformService === true,
      provider: r.provider,
      providerSlug: r.providerProfile?.customUrlSlug ?? null,
      providerAvatarUrl: r.providerProfile?.avatarUrl ?? null,
    }));
}

/** Active offerings on a public profile; empty unless the user provides
 *  services and is a visible (paid) creator (#314). */
export async function listPublicOfferings(targetUserId: string) {
  if (!(await findProvidesServices(targetUserId))) return [];
  if (!(await isCreatorVisible(targetUserId))) return [];
  const rows = await listActiveOfferingsByOwner(getDb(), targetUserId);
  return rows.map(maskPrice);
}

// ── Inquiries ───────────────────────────────────────────────────────────────

/** Inquiries where the user is the provider (incoming). */
export function listProviderInquiries(userId: string) {
  return listIncomingInquiries(getDb(), userId);
}

/** Inquiries the user submitted (buyer view). */
export function listBuyerRequests(userId: string) {
  return listOutgoingInquiries(getDb(), userId);
}

export async function submitInquiry(
  userId: string,
  serviceId: string,
  body: { message?: string; orderType?: string },
) {
  const db = getDb();
  const service = await findActiveOffering(db, serviceId);
  if (!service) throw notFound("Service");
  if (service.userId === userId) {
    throw new DomainError(403, "FORBIDDEN", "Cannot inquire about your own service");
  }
  const orderType = body.orderType === "purchase" ? "purchase" : "inquiry";
  const row = await insertInquiry(db, {
    serviceId: service.id,
    fromUserId: userId,
    providerId: service.userId,
    message: body.message ?? null,
    orderType,
    status: "pending",
    paidAmountCents: orderType === "purchase" ? service.priceCents : 0,
  });

  const buyerName = (await findIdentity(userId))?.name ?? "Someone";
  const isPurchase = orderType === "purchase";
  await NotificationService.notify({
    userId: service.userId,
    type: "service_inquiry",
    title: isPurchase ? `New purchase: ${service.title}` : `New inquiry: ${service.title}`,
    message: isPurchase
      ? `${buyerName} purchased your service "${service.title}"`
      : `${buyerName} sent an inquiry about "${service.title}"`,
    url: "/services/inquiries",
    refType: "service_inquiry",
    refId: row.id,
  });
  return row;
}

const INQUIRY_STATUSES = ["accepted", "rejected", "completed"] as const;

/** Provider moves an inquiry to accepted / rejected / completed. */
export async function setInquiryStatus(userId: string, inquiryId: string, status: unknown) {
  if (typeof status !== "string" || !(INQUIRY_STATUSES as readonly string[]).includes(status)) {
    throw new DomainError(400, "VALIDATION_ERROR", `status must be one of: ${INQUIRY_STATUSES.join(", ")}`);
  }
  const db = getDb();
  const inquiry = await findProviderInquiry(db, inquiryId, userId);
  if (!inquiry) throw notFound("Inquiry");

  const updated = await updateInquiryStatus(db, inquiryId, status);
  const title = await findOfferingTitle(db, inquiry.serviceId);
  const statusLabel = status === "rejected" ? "declined" : status;
  await NotificationService.notify({
    userId: inquiry.fromUserId,
    type: "service_inquiry",
    title: `Inquiry ${statusLabel}: ${title ?? "your service"}`,
    message: `Your inquiry was ${statusLabel}.`,
    url: "/services/my-requests",
    refType: "service_inquiry",
    refId: inquiry.id,
  });
  return updated;
}
