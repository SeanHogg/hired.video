/**
 * PlatformRepository — tenant + system-level config.
 *
 * Covers:
 *   • whitelabelTenants        — multi-tenant customization
 *   • accountInvitations       — invites issued to join an account
 *   • careerResilienceReports  — generated career insight reports
 *   • extractedProfiles        — scraped external profile data
 *
 * Grouped because these are all "platform config + system outputs"
 * rather than belonging to any user/company aggregate.
 */

import { and, count, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  whitelabelTenants,
  accountInvitations,
  careerResilienceReports,
  extractedProfiles,
} = schema;

export type DbLike = any;

export type WhitelabelTenantRow = typeof whitelabelTenants.$inferSelect;
export type WhitelabelTenantInsert = typeof whitelabelTenants.$inferInsert;
export type WhitelabelTenantSummary = Pick<
  WhitelabelTenantRow,
  "id" | "name" | "subdomain" | "tenantType" | "planTier" | "isActive" | "createdAt"
>;
export type WhitelabelPortalBranding = Pick<
  WhitelabelTenantRow,
  "id" | "name" | "subdomain" | "tenantType" | "primaryColor" | "logoUrl" | "heroHeadline" | "website"
>;
export type AccountInvitationRow = typeof accountInvitations.$inferSelect;
export type AccountInvitationInsert = typeof accountInvitations.$inferInsert;
export type CareerResilienceReportRow = typeof careerResilienceReports.$inferSelect;
export type ExtractedProfileRow = typeof extractedProfiles.$inferSelect;

export interface IPlatformRepository {
  // tenants
  findTenantById(id: string): Promise<WhitelabelTenantRow | null>;
  listTenants(): Promise<WhitelabelTenantRow[]>;
  insertTenant(input: WhitelabelTenantInsert): Promise<WhitelabelTenantRow>;
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

  /** Newest tenants first (admin list), summary columns only. */
  async listTenantSummaries(limit: number): Promise<WhitelabelTenantSummary[]> {
    return (await this.db
      .select({
        id: whitelabelTenants.id,
        name: whitelabelTenants.name,
        subdomain: whitelabelTenants.subdomain,
        tenantType: whitelabelTenants.tenantType,
        planTier: whitelabelTenants.planTier,
        isActive: whitelabelTenants.isActive,
        createdAt: whitelabelTenants.createdAt,
      })
      .from(whitelabelTenants)
      .orderBy(desc(whitelabelTenants.createdAt))
      .limit(limit)) as WhitelabelTenantSummary[];
  }

  async isSubdomainTaken(subdomain: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: whitelabelTenants.id })
      .from(whitelabelTenants)
      .where(eq(whitelabelTenants.subdomain, subdomain))
      .limit(1);
    return Boolean(row);
  }

  async findOwnedTenant(id: string, ownerId: string): Promise<WhitelabelTenantRow | null> {
    const [row] = await this.db
      .select()
      .from(whitelabelTenants)
      .where(and(eq(whitelabelTenants.id, id), eq(whitelabelTenants.ownerId, ownerId)))
      .limit(1);
    return (row as WhitelabelTenantRow) ?? null;
  }

  async updateTenant(id: string, patch: Partial<WhitelabelTenantInsert>): Promise<WhitelabelTenantRow> {
    const [row] = await this.db
      .update(whitelabelTenants)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(whitelabelTenants.id, id))
      .returning();
    return row as WhitelabelTenantRow;
  }

  /** Public branding for an active tenant's portal. */
  async findActivePortalBySubdomain(subdomain: string): Promise<WhitelabelPortalBranding | null> {
    const [row] = await this.db
      .select({
        id: whitelabelTenants.id,
        name: whitelabelTenants.name,
        subdomain: whitelabelTenants.subdomain,
        tenantType: whitelabelTenants.tenantType,
        primaryColor: whitelabelTenants.primaryColor,
        logoUrl: whitelabelTenants.logoUrl,
        heroHeadline: whitelabelTenants.heroHeadline,
        website: whitelabelTenants.website,
      })
      .from(whitelabelTenants)
      .where(and(eq(whitelabelTenants.subdomain, subdomain), eq(whitelabelTenants.isActive, true)))
      .limit(1);
    return (row as WhitelabelPortalBranding) ?? null;
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

  /** Accepted invitations this user sent — the employer dashboard team size. */
  async countAcceptedInvitationsSentBy(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(accountInvitations)
      .where(and(eq(accountInvitations.invitedBy, userId), eq(accountInvitations.status, "accepted")));
    return Number(row?.total ?? 0);
  }

  /** Invitations this user has sent (any status) — the team-size meter. */
  async countInvitationsSentBy(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(accountInvitations)
      .where(eq(accountInvitations.invitedBy, userId));
    return Number(row?.total ?? 0);
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
