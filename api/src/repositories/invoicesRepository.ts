/**
 * InvoicesRepository — persisted billing events + the invoice + the
 * enrichment add-on ledger. Separate aggregate from Subscriptions
 * because invoices are append-only snapshots (an invoice row is
 * immutable once issued; a subscription row mutates on every plan
 * change) and from Tokens because enrichment credits are a different
 * SKU with its own accounting.
 */

import { and, desc, eq, gte, sum } from "drizzle-orm";
import { schema } from "../db/index.js";

const { invoices, billingEvents, enrichmentCredits, enrichmentTransactions } = schema;

export type DbLike = any;

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceInsert = typeof invoices.$inferInsert;
export type BillingEventRow = typeof billingEvents.$inferSelect;
export type BillingEventInsert = typeof billingEvents.$inferInsert;
export type EnrichmentCreditsRow = typeof enrichmentCredits.$inferSelect;
export type EnrichmentTransactionRow = typeof enrichmentTransactions.$inferSelect;
export type EnrichmentTransactionInsert = typeof enrichmentTransactions.$inferInsert;

export interface IInvoicesRepository {
  findInvoiceById(id: string): Promise<InvoiceRow | null>;
  findInvoicesForUser(userId: string, limit?: number): Promise<InvoiceRow[]>;
  insertInvoice(input: InvoiceInsert): Promise<InvoiceRow>;
  insertBillingEvent(input: BillingEventInsert): Promise<void>;
  findEnrichmentCreditsForUser(userId: string): Promise<EnrichmentCreditsRow | null>;
  insertEnrichmentTransaction(input: EnrichmentTransactionInsert): Promise<void>;
}

export class InvoicesRepository implements IInvoicesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findInvoiceById(id: string): Promise<InvoiceRow | null> {
    const [row] = await this.db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return (row as InvoiceRow) ?? null;
  }

  async findInvoicesForUser(userId: string, limit = 50): Promise<InvoiceRow[]> {
    return (await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt))
      .limit(Math.min(200, Math.max(1, limit)))) as InvoiceRow[];
  }

  async insertInvoice(input: InvoiceInsert): Promise<InvoiceRow> {
    const [row] = await this.db.insert(invoices).values(input as any).returning();
    return row as InvoiceRow;
  }

  async insertBillingEvent(input: BillingEventInsert): Promise<void> {
    await this.db.insert(billingEvents).values(input as any);
  }

  async findEnrichmentCreditsForUser(userId: string): Promise<EnrichmentCreditsRow | null> {
    const [row] = await this.db
      .select()
      .from(enrichmentCredits)
      .where(eq(enrichmentCredits.userId, userId))
      .limit(1);
    return (row as EnrichmentCreditsRow) ?? null;
  }

  async insertEnrichmentTransaction(input: EnrichmentTransactionInsert): Promise<void> {
    await this.db.insert(enrichmentTransactions).values(input as any);
  }

  // Pin otherwise-unused imports reserved for future date-range /
  // summed-amount reports on the admin billing dashboard.
  private readonly _andPinned = and;
  private readonly _gtePinned = gte;
  private readonly _sumPinned = sum;
}
