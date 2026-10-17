/** Evaluator certification gate persistence (#1384). */

import { and, eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { IEvaluatorCertificationRepository } from "./interfaces.js";
import type {
  DbLike,
} from "./types.js";

const { courseCertificates } = schema;

export class EvaluatorCertificationRepository implements IEvaluatorCertificationRepository {
  constructor(private readonly db: DbLike) {}

  async hasActiveCertification(
    userId: string,
    courseId: string,
    now: Date,
  ): Promise<boolean> {
    const rows = (await this.db
      .select()
      .from(courseCertificates)
      .where(
        and(
          eq(courseCertificates.userId, userId),
          eq(courseCertificates.courseId, courseId),
        ),
      )) as Array<{
      revokedAt: Date | null;
      expiresAt: Date | null;
    }>;
    return rows.some(
      (r) =>
        r.revokedAt == null &&
        (r.expiresAt == null || new Date(r.expiresAt) > now),
    );
  }
}
