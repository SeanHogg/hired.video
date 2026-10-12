/**
 * Enrich a stored contact through the native EnrichmentProvider seam,
 * spending one enrichment credit, and fill the fields it was missing.
 */
import type { Repos } from "../../repositories/index.js";
import type { ContactRow } from "../../repositories/contactsRepository.js";
import { enrichAndAudit, type EnrichmentResult } from "../enrichment/index.js";
import { spendEnrichmentCredits } from "../enrichment/credits.js";
import { fillMissing } from "./merge.js";

const CREDITS_PER_ENRICHMENT = 1;

export type EnrichContactResult =
  | { ok: true; contact: ContactRow; enriched: boolean; creditsRemaining: number }
  | { ok: false; reason: "not_found" | "insufficient_credits" };

function companyDomain(email: string | null): string | undefined {
  return email?.split("@")[1] ?? undefined;
}

export async function enrichContact(
  deps: Pick<Repos, "contacts">,
  ownerUserId: string,
  contactId: string,
): Promise<EnrichContactResult> {
  const contact = await deps.contacts.findById(ownerUserId, contactId);
  if (!contact) return { ok: false, reason: "not_found" };

  const spend = await spendEnrichmentCredits(
    ownerUserId,
    CREDITS_PER_ENRICHMENT,
    `Contact enrichment: ${contact.email ?? contact.fullName ?? contact.id}`,
    contact.id,
  );
  if (!spend.ok) return { ok: false, reason: "insufficient_credits" };

  const result: EnrichmentResult = await enrichAndAudit(
    ownerUserId,
    {
      email: contact.email ?? undefined,
      name: contact.fullName ?? undefined,
      company: contact.company ?? undefined,
      domain: companyDomain(contact.email),
    },
    CREDITS_PER_ENRICHMENT,
  );
  if (!result.enriched) {
    return { ok: true, contact, enriched: false, creditsRemaining: spend.balanceAfter };
  }
  const patch = fillMissing(contact, {
    fullName: result.name,
    company: result.company,
    title: result.title,
    phone: result.phone,
    linkedinUrl: result.linkedInUrl,
  });
  const updated = await deps.contacts.update(ownerUserId, contact.id, { ...patch, enrichedAt: new Date() });
  return { ok: true, contact: updated ?? contact, enriched: true, creditsRemaining: spend.balanceAfter };
}
