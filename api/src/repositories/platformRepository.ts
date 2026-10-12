/**
 * PlatformRepository — tenant + system-level config.
 *
 * Covers:
 *   • whitelabelTenants        — multi-tenant customization
 *   • featureFlags             — server-side rollout switches
 *   • accountInvitations       — invites issued to join an account
 *   • careerResilienceReports  — generated career insight reports
 *   • extractedProfiles        — scraped external profile data
 *
 * Grouped because these are all "platform config + system outputs"
 * rather than belonging to any user/company aggregate. Don't confuse
 * with AuthzRepository (module grants): feature flags are rolloutable
 * flags, not per-user permissions.
 */

import { desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  whitelabelTenants,
  featureFlags,
  accountInvitations,
  careerResilienceReports,
  extractedProfiles,
} = schema;

export type DbLike = any;

export type WhitelabelTenantRow = typeof whitelabelTenants.$inferSelect;
export type WhitelabelTenantInsert = typeof whitelabelTenants.$inferInsert;
export type FeatureFlagRow = typeof featureFlags.$inferSelect;
export type AccountInvitationRow = typeof accountInvitations.$inferSelect;
export type AccountInvitationInsert = typeof accountInvitations.$inferInsert;
export type CareerResilienceReportRow = typeof careerResilienceReports.$inferSelect;
export type ExtractedProfileRow = typeof extractedProfiles.$inferSelect;

export interface IPlatformRepository {
  // tenants
  findTenantById(id: string): Promise<WhitelabelTenantRow | null>;
  listTenants(): Promise<WhitelabelTenantRow[]>;
  insertTenant(input: WhitelabelTenantInsert): Promise<WhitelabelTenantRow>;
  // feature flags
  findFeatureFlagByKey(key: string): Promise<FeatureFlagRow | null>;
  listFeatureFlags(): Promise<FeatureFlagRow[]>;
  // account invitations
  findInvitationById(id: string): Promise<AccountInvitationRow | null>;
  listPendingInvitations(limit?: number): Promise<AccountInvitationRow[]>;
  countPendingInvitations(): Promise<number>;
  countAcceptedInvitations(): Promise<number>;
  insertInvitation(input: AccountInvitationInsert): Promise<AccountInvitationRow>;
  markInvitationAccepted(id: string): Promise<void>;
  // insights (generated outputs)
  findCareerResilienceReportsForUser(userId: string): Promise<CareerResilienceReportRow[]>;
  findExtractedProfileByUrl(url: string): Promise<ExtractedProfileRow | null>;
}

export class PlatformRepository implements IPlatformRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findTenantById(id: string): Promise<WhitelabelTenantRow | null> {
    const [row] = await this.db.select().from(whitelabelTenants).where(eq(whitelabelTenants.id, id)).limit(1);
    return (row as WhitelabelTenantRow) ?? null;
  }

  async listTenants(): Promise<WhitelabelTenantRow[]> {
    return (await this.db.select().from(whitelabelTenants)) as WhitelabelTenantRow[];
  }

  async insertTenant(input: WhitelabelTenantInsert): Promise<WhitelabelTenantRow> {
    const [row] = await this.db.insert(whitelabelTenants).values(input as any).returning();
    return row as WhitelabelTenantRow;
  }

  async findFeatureFlagByKey(key: string): Promise<FeatureFlagRow | null> {
    const [row] = await this.db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    return (row as FeatureFlagRow) ?? null;
  }

  async listFeatureFlags(): Promise<FeatureFlagRow[]> {
    return (await this.db.select().from(featureFlags)) as FeatureFlagRow[];
  }

  async findInvitationById(id: string): Promise<AccountInvitationRow | null> {
    const [row] = await this.db
      .select()
      .from(accountInvitations)
      .where(eq(accountInvitations.id, id))
      .limit(1);
    return (row as AccountInvitationRow) ?? null;
  }

  async listPendingInvitations(limit = 100): Promise<AccountInvitationRow[]> {
    return (await this.db
      .select()
      .from(accountInvitations)
      .where(eq(accountInvitations.status, "pending"))
      .orderBy(desc(accountInvitations.createdAt))
      .limit(Math.min(500, Math.max(1, limit)))) as AccountInvitationRow[];
  }

  async countPendingInvitations(): Promise<number> {
    const rows = await this.db
      .select()
      .from(accountInvitations)
      .where(eq(accountInvitations.status, "pending"));
    return (rows as any[]).length;
  }

  async countAcceptedInvitations(): Promise<number> {
    const rows = await this.db
      .select()
      .from(accountInvitations)
      .where(eq(accountInvitations.status, "accepted"));
    return (rows as any[]).length;
  }

  async insertInvitation(input: AccountInvitationInsert): Promise<AccountInvitationRow> {
    const [row] = await this.db.insert(accountInvitations).values(input as any).returning();
    return row as AccountInvitationRow;
  }

  async markInvitationAccepted(id: string): Promise<void> {
    await this.db
      .update(accountInvitations)
      .set({ status: "accepted", acceptedAt: this.now() } as any)
      .where(eq(accountInvitations.id, id));
  }

  async findCareerResilienceReportsForUser(userId: string): Promise<CareerResilienceReportRow[]> {
    return (await this.db
      .select()
      .from(careerResilienceReports)
      .where(eq(careerResilienceReports.userId, userId))
      .orderBy(desc(careerResilienceReports.createdAt))) as CareerResilienceReportRow[];
  }

  async findExtractedProfileByUrl(url: string): Promise<ExtractedProfileRow | null> {
    const [row] = await this.db
      .select()
      .from(extractedProfiles)
      .where(eq(extractedProfiles.sourceUrl, url))
      .limit(1);
    return (row as ExtractedProfileRow) ?? null;
  }
}
