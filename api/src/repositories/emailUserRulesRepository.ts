/**
 * EmailUserRulesRepository — per-user inbox classification rules.
 *
 * The default ATS-domain ruleset lives in code (services/email-integration/
 * default-rules.ts) and is hard-coded; this repo is for user-authored
 * overrides created via the Settings rule editor.
 */

import { and, asc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { emailUserRules } = schema;

export type DbLike = any;

export type EmailUserRuleRow = typeof emailUserRules.$inferSelect;
export type EmailUserRuleInsert = typeof emailUserRules.$inferInsert;
export type EmailUserRulePatch = Partial<EmailUserRuleInsert>;

export interface IEmailUserRulesRepository {
  findEnabledForUser(userId: string): Promise<EmailUserRuleRow[]>;
  findAllForUser(userId: string): Promise<EmailUserRuleRow[]>;
  findById(id: string, userId: string): Promise<EmailUserRuleRow | null>;
  insert(input: EmailUserRuleInsert): Promise<EmailUserRuleRow>;
  patch(id: string, userId: string, patch: EmailUserRulePatch): Promise<void>;
  remove(id: string, userId: string): Promise<void>;
}

export class EmailUserRulesRepository implements IEmailUserRulesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findEnabledForUser(userId: string): Promise<EmailUserRuleRow[]> {
    return (await this.db
      .select()
      .from(emailUserRules)
      .where(and(eq(emailUserRules.userId, userId), eq(emailUserRules.isEnabled, true)))
      .orderBy(asc(emailUserRules.priority))) as EmailUserRuleRow[];
  }

  async findAllForUser(userId: string): Promise<EmailUserRuleRow[]> {
    return (await this.db
      .select()
      .from(emailUserRules)
      .where(eq(emailUserRules.userId, userId))
      .orderBy(asc(emailUserRules.priority))) as EmailUserRuleRow[];
  }

  async findById(id: string, userId: string): Promise<EmailUserRuleRow | null> {
    const rows = (await this.db
      .select()
      .from(emailUserRules)
      .where(and(eq(emailUserRules.id, id), eq(emailUserRules.userId, userId)))
      .limit(1)) as EmailUserRuleRow[];
    return rows[0] ?? null;
  }

  async insert(input: EmailUserRuleInsert): Promise<EmailUserRuleRow> {
    const [row] = await this.db.insert(emailUserRules).values(input as any).returning();
    return row as EmailUserRuleRow;
  }

  async patch(id: string, userId: string, patch: EmailUserRulePatch): Promise<void> {
    await this.db
      .update(emailUserRules)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(and(eq(emailUserRules.id, id), eq(emailUserRules.userId, userId)));
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.db
      .delete(emailUserRules)
      .where(and(eq(emailUserRules.id, id), eq(emailUserRules.userId, userId)));
  }
}
