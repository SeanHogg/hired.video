/**
 * Region waitlist — an out-of-region visitor registers interest in signing
 * up (POST /api/security/region-waitlist). Records the entry (idempotent per
 * pending email) and the geo/OFAC bot-block telemetry for the SuperAdmin globe.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { RegionWaitlistRepository } from "../../repositories/regionWaitlistRepository.js";
import { recordBotBlock } from "./botBlock.js";
import { classifySignupEligibility } from "./geo.js";

export async function joinRegionWaitlist(input: {
  email: string;
  reason: string | null;
  country: string | null;
}): Promise<void> {
  const { country } = input;
  if (!country) throw new DomainError(400, "UNKNOWN_COUNTRY", "Could not determine country");
  const eligibility = classifySignupEligibility(country);
  if (eligibility === "allowed") {
    throw new DomainError(409, "CONFLICT", "Your country is already supported. Please sign up directly.");
  }
  const db = getDb();
  try {
    await new RegionWaitlistRepository(db).insertPending({
      email: input.email,
      countryCode: country,
      reason: input.reason,
    });
  } catch {
    // The user-visible outcome is the same either way: "you're on the list".
  }
  // Telemetry: this user wanted to sign up but couldn't.
  await recordBotBlock({
    db,
    endpoint: "region-waitlist",
    reason: eligibility === "sanctioned" ? "OFAC_BLOCKED" : "GEO_BLOCKED",
    countryCode: country,
    email: input.email,
  });
}
