/**
 * BillingAddressRepository — the one reader/writer of `billing_addresses`
 * (mig 0631; moved off `user_profiles.billing_*`). Speaks the
 * `BillingAddress` shape from shared/billing-address.ts so callers never see
 * column names.
 */

import { eq } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { BillingAddress } from "../../../shared/billing-address.js";

const { billingAddresses } = schema;

export type DbLike = any;

type BillingAddressColumns = Pick<
  typeof billingAddresses.$inferSelect,
  "fullName" | "company" | "line1" | "line2" | "city" | "state" | "postalCode" | "country" | "phone"
>;

/** The address is "set" iff every required field is populated; anything less
 *  is treated as not yet provided (empty Checkout / Settings form). */
export function rowToBillingAddress(row: BillingAddressColumns | null | undefined): BillingAddress | null {
  if (!row || !row.fullName || !row.line1 || !row.city || !row.state || !row.postalCode || !row.country) {
    return null;
  }
  return {
    fullName: row.fullName,
    company: row.company,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    phone: row.phone,
  };
}

function toColumns(addr: BillingAddress): BillingAddressColumns {
  return {
    fullName: addr.fullName,
    company: addr.company ?? null,
    line1: addr.line1,
    line2: addr.line2 ?? null,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
    country: addr.country,
    phone: addr.phone ?? null,
  };
}

export class BillingAddressRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findByUserId(userId: string): Promise<BillingAddress | null> {
    const [row] = await this.db
      .select({
        fullName: billingAddresses.fullName,
        company: billingAddresses.company,
        line1: billingAddresses.line1,
        line2: billingAddresses.line2,
        city: billingAddresses.city,
        state: billingAddresses.state,
        postalCode: billingAddresses.postalCode,
        country: billingAddresses.country,
        phone: billingAddresses.phone,
      })
      .from(billingAddresses)
      .where(eq(billingAddresses.userId, userId))
      .limit(1);
    return rowToBillingAddress(row);
  }

  async upsert(userId: string, addr: BillingAddress): Promise<void> {
    const cols = toColumns(addr);
    await this.db
      .insert(billingAddresses)
      .values({ userId, ...cols, updatedAt: this.now() })
      .onConflictDoUpdate({
        target: billingAddresses.userId,
        set: { ...cols, updatedAt: this.now() },
      });
  }

  /** GDPR erasure — the address is PII with no audit value once the user is gone. */
  async deleteForUser(userId: string): Promise<void> {
    await this.db.delete(billingAddresses).where(eq(billingAddresses.userId, userId));
  }
}
