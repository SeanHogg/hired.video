/**
 * ReviewSubjectsRepository — the per-subject-type lookups the polymorphic
 * reviews flow needs to resolve WHAT is being reviewed (owner, buyer,
 * required state, verification inputs) and WHO is reviewing (verified
 * email). Template subjects resolve through StudioTemplatesRepository.
 */

import { and, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

export type DbLike = any;

const {
  companyProfiles,
  promoProjects,
  articles,
  courses,
  courseEnrollments,
  courseCertificates,
  users,
} = schema;

export class ReviewSubjectsRepository {
  constructor(private readonly db: DbLike) {}

  async findCompany(id: string): Promise<{ id: string; ownerId: string; website: string | null } | undefined> {
    const [row] = await this.db
      .select({
        id: companyProfiles.id,
        ownerId: companyProfiles.ownerId,
        website: companyProfiles.website,
      })
      .from(companyProfiles)
      .where(eq(companyProfiles.id, id))
      .limit(1);
    return row;
  }

  async findPromoProject(
    id: string,
  ): Promise<{ id: string; customerId: string; creatorId: string; status: string } | undefined> {
    const [row] = await this.db
      .select({
        id: promoProjects.id,
        customerId: promoProjects.customerId,
        creatorId: promoProjects.creatorId,
        status: promoProjects.status,
      })
      .from(promoProjects)
      .where(eq(promoProjects.id, id))
      .limit(1);
    return row;
  }

  async findArticleOwner(id: string): Promise<{ ownerId: string } | undefined> {
    const [row] = await this.db
      .select({ ownerId: articles.userId })
      .from(articles)
      .where(eq(articles.id, id))
      .limit(1);
    return row;
  }

  async findCourseOwner(id: string): Promise<{ ownerId: string } | undefined> {
    const [row] = await this.db
      .select({ ownerId: courses.userId })
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);
    return row;
  }

  async findCourseEnrollment(courseId: string, userId: string): Promise<{ userId: string } | undefined> {
    const [row] = await this.db
      .select({ userId: courseEnrollments.userId })
      .from(courseEnrollments)
      .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, userId)))
      .limit(1);
    return row;
  }

  async findCertificateHolder(id: string): Promise<{ ownerId: string } | undefined> {
    const [row] = await this.db
      .select({ ownerId: courseCertificates.userId })
      .from(courseCertificates)
      .where(eq(courseCertificates.id, id))
      .limit(1);
    return row;
  }

  async findReviewerEmail(userId: string): Promise<{ email: string; emailVerified: boolean } | undefined> {
    const [row] = await this.db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row;
  }
}
