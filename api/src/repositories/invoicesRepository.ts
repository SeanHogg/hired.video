/**
 * InvoicesRepository — persisted billing events + the invoice. Separate
 * aggregate from Subscriptions because invoices are append-only snapshots
 * (an invoice row is immutable once issued; a subscription row mutates on
 * every plan change). Enrichment credits are a wallet (WalletRepository).
 */

import { and, desc, eq, gte, sum } from "drizzle-orm";
import { schema } from "../db/index.js";

const { invoices, billingEvents } = schema;

export type DbLike = any;

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceInsert = typeof invoices.$inferInsert;
export type BillingEventRow = typeof billingEvents.$inferSelect;
export type BillingEventInsert = typeof billingEvents.$inferInsert;

export interface IInvoicesRepository {
  findInvoiceById(id: string): Promise<InvoiceRow | null>;
  findInvoicesForUser(userId: string, limit?: number): Promise<InvoiceRow[]>;
  insertInvoice(input: InvoiceInsert): Promise<InvoiceRow>;
  insertBillingEvent(input: BillingEventInsert): Promise<void>;
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

  // Pin otherwise-unused imports reserved for future date-range /
  // summed-amount reports on the admin billing dashboard.
  private readonly _andPinned = and;
  private readonly _gtePinned = gte;
  private readonly _sumPinned = sum;
}
