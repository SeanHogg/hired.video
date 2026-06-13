/**
 * InboxProfilesRepository — role-keyed inbox classifier profiles.
 *
 * System presets (`is_preset = true`, `owner_id IS NULL`) are seeded by
 * migration and shared across all users; clones are owner-scoped. The
 * cached read path lives in `services/email-integration/profile-service.ts`
 * (getOrSetCached keyed on owner/profile/version) — this repo is the raw
 * data access only.
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { inboxProfiles } = schema;

export type DbLike = any;

export type InboxProfileRow = typeof inboxProfiles.$inferSelect;
export type InboxProfileInsert = typeof inboxProfiles.$inferInsert;
export type InboxProfilePatch = Partial<InboxProfileInsert>;

export interface IInboxProfilesRepository {
  findById(id: string): Promise<InboxProfileRow | null>;
  findByPresetKey(presetKey: string): Promise<InboxProfileRow | null>;
  listPresets(): Promise<InboxProfileRow[]>;
  /** Presets + the owner's own clones — the set the builder offers. */
  listAvailableForOwner(ownerId: string): Promise<InboxProfileRow[]>;
  insert(input: InboxProfileInsert): Promise<InboxProfileRow>;
  /** Patch + bump `version` atomically so cache keys invalidate. Scoped
   *  to the owner so a user can't edit a preset or another user's clone. */
  patchOwned(id: string, ownerId: string, patch: InboxProfilePatch): Promise<InboxProfileRow | null>;
  removeOwned(id: string, ownerId: string): Promise<void>;
}

export class InboxProfilesRepository implements IInboxProfilesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findById(id: string): Promise<InboxProfileRow | null> {
    const rows = (await this.db
      .select()
      .from(inboxProfiles)
      .where(eq(inboxProfiles.id, id))
      .limit(1)) as InboxProfileRow[];
    return rows[0] ?? null;
  }

  async findByPresetKey(presetKey: string): Promise<InboxProfileRow | null> {
    const rows = (await this.db
      .select()
      .from(inboxProfiles)
      .where(eq(inboxProfiles.presetKey, presetKey))
      .limit(1)) as InboxProfileRow[];
    return rows[0] ?? null;
  }

  async listPresets(): Promise<InboxProfileRow[]> {
    return (await this.db
      .select()
      .from(inboxProfiles)
      .where(eq(inboxProfiles.isPreset, true))) as InboxProfileRow[];
  }

  async listAvailableForOwner(ownerId: string): Promise<InboxProfileRow[]> {
    return (await this.db
      .select()
      .from(inboxProfiles)
      .where(or(eq(inboxProfiles.isPreset, true), eq(inboxProfiles.ownerId, ownerId)))) as InboxProfileRow[];
  }

  async insert(input: InboxProfileInsert): Promise<InboxProfileRow> {
    const [row] = await this.db.insert(inboxProfiles).values(input as any).returning();
    return row as InboxProfileRow;
  }

  async patchOwned(
    id: string,
    ownerId: string,
    patch: InboxProfilePatch,
  ): Promise<InboxProfileRow | null> {
    const rows = (await this.db
      .update(inboxProfiles)
      .set({
        ...patch,
        version: sql`${inboxProfiles.version} + 1`,
        updatedAt: this.now(),
      } as any)
      .where(and(eq(inboxProfiles.id, id), eq(inboxProfiles.ownerId, ownerId)))
      .returning()) as InboxProfileRow[];
    return rows[0] ?? null;
  }

  async removeOwned(id: string, ownerId: string): Promise<void> {
    await this.db
      .delete(inboxProfiles)
      .where(and(eq(inboxProfiles.id, id), eq(inboxProfiles.ownerId, ownerId)));
  }
}
