/**
 * BoostSubjectsRepository — who owns a promotable subject. The boost
 * checkout (services/billing/checkout/kinds/boost.ts) decides; this file
 * only reads rows.
 */

import { eq } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { BoostableSubject } from "../../../shared/checkout.js";

const { companyProfiles, promoProjects, reviews } = schema;

export type DbLike = any;

export class BoostSubjectsRepository {
  constructor(private readonly db: DbLike) {}

  /** The owner of a subject, or null when it doesn't exist or its type has
   *  no owner lookup wired yet (feed_post, video, resume, voice_clone,
   *  service — those opt in by adding a case here). */
  async ownerOf(type: BoostableSubject, id: string): Promise<string | null> {
    switch (type) {
      case "review": {
        const [r] = await this.db.select({ ownerId: reviews.userId }).from(reviews).where(eq(reviews.id, id)).limit(1);
        return r?.ownerId ?? null;
      }
      case "company": {
        const [r] = await this.db
          .select({ ownerId: companyProfiles.ownerId })
          .from(companyProfiles)
          .where(eq(companyProfiles.id, id))
          .limit(1);
        return r?.ownerId ?? null;
      }
      case "promo_project": {
        const [r] = await this.db
          .select({ ownerId: promoProjects.creatorId })
          .from(promoProjects)
          .where(eq(promoProjects.id, id))
          .limit(1);
        return r?.ownerId ?? null;
      }
      default:
        return null;
    }
  }
}
