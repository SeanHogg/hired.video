/** career_resilience_reports — the AI resilience reports (gap #103). */
import { desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { DbLike } from "./resumeRepository.js";

const reports = schema.careerResilienceReports;
export type CareerResilienceReportRow = typeof reports.$inferSelect;

export class CareerResilienceRepository {
  constructor(private readonly db: DbLike) {}

  async insert(row: typeof reports.$inferInsert): Promise<CareerResilienceReportRow> {
    const [created] = await this.db.insert(reports).values(row).returning();
    return created as CareerResilienceReportRow;
  }

  async listForUser(userId: string, limit = 10): Promise<CareerResilienceReportRow[]> {
    return this.db.select().from(reports).where(eq(reports.userId, userId)).orderBy(desc(reports.createdAt)).limit(limit);
  }

  async findByShareToken(token: string): Promise<CareerResilienceReportRow | null> {
    const [row] = await this.db.select().from(reports).where(eq(reports.shareToken, token)).limit(1);
    return (row as CareerResilienceReportRow | undefined) ?? null;
  }
}
