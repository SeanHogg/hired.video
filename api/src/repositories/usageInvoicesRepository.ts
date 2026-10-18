/**
 * UsageInvoicesRepository — reads of the frozen monthly usage invoices
 * (`usage_invoices`) written by the month-close cron.
 */

import { desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { usageInvoices } = schema;

export type DbLike = any;

export type UsageInvoiceRow = typeof usageInvoices.$inferSelect;

export class UsageInvoicesRepository {
  constructor(private readonly db: DbLike) {}

  /** Every closed invoice for the user, newest period first. */
  async listForUser(userId: string): Promise<UsageInvoiceRow[]> {
    return (await this.db
      .select()
      .from(usageInvoices)
      .where(eq(usageInvoices.userId, userId))
      .orderBy(desc(usageInvoices.periodStart))) as UsageInvoiceRow[];
  }
}
