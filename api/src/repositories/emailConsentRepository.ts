/**
 * EmailConsentRepository — pure data access for marketing email consent
 * (migration 0205): the soft, user-managed `email_marketing_preferences`
 * ledger AND the hard, system-set `email_suppressions` list (bounces /
 * complaints). One aggregate because both answer the same question — "may we
 * mail this address?" — and both are consulted on every marketing send.
 *
 * No business logic / token minting / rendering — that lives in
 * services/email/MarketingConsentService.ts.
 */
import { eq, inArray } from "drizzle-orm";
import { schema } from "../db/index.js";

const { emailMarketingPreferences, emailSuppressions } = schema;

export type DbLike = any;
export type PreferenceRow = typeof emailMarketingPreferences.$inferSelect;
export type PreferenceInsert = typeof emailMarketingPreferences.$inferInsert;

export interface IEmailConsentRepository {
  findPrefByEmail(email: string): Promise<PreferenceRow | null>;
  findPrefByToken(token: string): Promise<PreferenceRow | null>;
  insertPref(values: PreferenceInsert): Promise<PreferenceRow>;
  updatePref(email: string, patch: Partial<PreferenceInsert>): Promise<PreferenceRow | null>;
  /** Batch — load every existing pref row for a recipient set (send path). */
  prefsForEmails(emails: string[]): Promise<PreferenceRow[]>;
  /** Batch — the hard-suppressed subset of a recipient set. */
  hardSuppressedSet(emails: string[]): Promise<Set<string>>;
  addHardSuppression(email: string, reason: string, campaignId?: string | null): Promise<void>;
}

export class EmailConsentRepository implements IEmailConsentRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findPrefByEmail(email: string): Promise<PreferenceRow | null> {
    const [row] = await this.db
      .select()
      .from(emailMarketingPreferences)
      .where(eq(emailMarketingPreferences.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async findPrefByToken(token: string): Promise<PreferenceRow | null> {
    const [row] = await this.db
      .select()
      .from(emailMarketingPreferences)
      .where(eq(emailMarketingPreferences.token, token))
      .limit(1);
    return row ?? null;
  }

  async insertPref(values: PreferenceInsert): Promise<PreferenceRow> {
    const [row] = await this.db
      .insert(emailMarketingPreferences)
      .values({ ...values, email: values.email.toLowerCase() })
      // Concurrent mint (e.g. two sends resolving the same lead at once) is a
      // no-op insert; the caller re-reads by email.
      .onConflictDoNothing({ target: emailMarketingPreferences.email })
      .returning();
    if (row) return row;
    const existing = await this.findPrefByEmail(values.email);
    return existing!;
  }

  async updatePref(email: string, patch: Partial<PreferenceInsert>): Promise<PreferenceRow | null> {
    const [row] = await this.db
      .update(emailMarketingPreferences)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(emailMarketingPreferences.email, email.toLowerCase()))
      .returning();
    return row ?? null;
  }

  async prefsForEmails(emails: string[]): Promise<PreferenceRow[]> {
    if (emails.length === 0) return [];
    const lowered = emails.map((e) => e.toLowerCase());
    return this.db
      .select()
      .from(emailMarketingPreferences)
      .where(inArray(emailMarketingPreferences.email, lowered));
  }

  async hardSuppressedSet(emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const lowered = emails.map((e) => e.toLowerCase());
    const rows = await this.db
      .select({ email: emailSuppressions.email })
      .from(emailSuppressions)
      .where(inArray(emailSuppressions.email, lowered));
    return new Set(rows.map((r: { email: string }) => r.email));
  }

  async addHardSuppression(email: string, reason: string, campaignId?: string | null): Promise<void> {
    await this.db
      .insert(emailSuppressions)
      .values({ email: email.toLowerCase(), reason, campaignId: campaignId ?? null })
      .onConflictDoNothing({ target: emailSuppressions.email });
  }
}
