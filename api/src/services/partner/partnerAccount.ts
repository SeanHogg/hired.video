/**
 * Partner account self-service use cases behind `/api/partner-account/*`:
 * request partner access (→ SuperAdmin approval + emails) and resolve the
 * caller's ACTIVE partner for key management.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { getPartnerByOwner, requestPartner, type PartnerView } from "./partners.js";
import { notifyAdminOfPartnerRequest, sendPartnerRequestReceipt } from "./emails.js";

export interface PartnerAccessRequest {
  name: string;
  websiteUrl?: string;
  contactEmail?: string;
  requestNote?: string;
}

async function requesterIdentity(userId: string): Promise<{ name: string; email: string }> {
  const u = await new UsersRepository(getDb()).findById(userId);
  return { name: u?.name ?? "A Hired.Video user", email: u?.email ?? "" };
}

/** File a partner-access request; 409 while one is pending or already active. */
export async function requestPartnerAccess(userId: string, body: PartnerAccessRequest): Promise<PartnerView> {
  const existing = await getPartnerByOwner(userId);
  if (existing && (existing.status === "pending" || existing.status === "active")) {
    throw new DomainError(
      409,
      "CONFLICT",
      existing.status === "active"
        ? "You already have approved partner access."
        : "You already have a pending partner request under review.",
      { partner: existing },
    );
  }

  const requester = await requesterIdentity(userId);
  const partner = await requestPartner({
    ownerUserId: userId,
    name: body.name,
    websiteUrl: body.websiteUrl ?? null,
    contactEmail: body.contactEmail ?? requester.email,
    requestNote: body.requestNote ?? null,
  });

  // Fire lifecycle emails (best-effort; no-op without a configured provider).
  await Promise.allSettled([
    notifyAdminOfPartnerRequest(partner, requester),
    sendPartnerRequestReceipt(requester),
  ]);
  return partner;
}

/** The caller's ACTIVE partner id, or a 403. */
export async function requireActivePartnerId(userId: string): Promise<string> {
  const partner = await getPartnerByOwner(userId);
  if (!partner) throw new DomainError(403, "FORBIDDEN", "Request partner access first.");
  if (partner.status !== "active") throw new DomainError(403, "FORBIDDEN", "Your partner access is not approved yet.");
  return partner.id;
}
