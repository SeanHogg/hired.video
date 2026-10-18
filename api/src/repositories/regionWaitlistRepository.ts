/**
 * RegionWaitlistRepository — the public write side of `region_waitlist`
 * (out-of-region visitors registering interest). The SuperAdmin review reads
 * live in admin/adminSecurityRepository.ts.
 */
import { schema } from "../db/index.js";

const { regionWaitlist } = schema;

export type DbLike = any;

export interface RegionWaitlistEntry {
  email: string;
  countryCode: string;
  reason: string | null;
}

export interface IRegionWaitlistRepository {
  /** Idempotent: an address already pending (partial unique index) is a no-op. */
  insertPending(entry: RegionWaitlistEntry): Promise<void>;
}

export class RegionWaitlistRepository implements IRegionWaitlistRepository {
  constructor(private readonly db: DbLike) {}

  async insertPending(entry: RegionWaitlistEntry): Promise<void> {
    await this.db.insert(regionWaitlist).values(entry).onConflictDoNothing();
  }
}
