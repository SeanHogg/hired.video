/**
 * ContactsRepository — the contacts aggregate (`contacts` + its
 * `contact_job_links`), always owner-scoped. Migration 0493.
 */
import { and, desc, eq, ilike, ne, notInArray, or, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { contacts, contactJobLinks } = schema;

export type DbLike = any;

export type ContactRow = typeof contacts.$inferSelect;
export type ContactInsert = typeof contacts.$inferInsert;
export type ContactPatch = Partial<Omit<ContactInsert, "id" | "ownerUserId" | "createdAt">>;
export type ContactJobLinkRow = typeof contactJobLinks.$inferSelect;

export interface ContactListFilters {
  q?: string;
  lifecycle?: string;
  limit: number;
  offset: number;
}

/** Fields the duplicate finder narrows on before scoring in the domain. */
export interface DuplicateProbe {
  fullName: string | null;
  phone: string | null;
  linkedinUrl: string | null;
}

export interface IContactsRepository {
  findById(ownerUserId: string, id: string): Promise<ContactRow | null>;
  findByEmail(ownerUserId: string, email: string): Promise<ContactRow | null>;
  list(ownerUserId: string, filters: ContactListFilters): Promise<ContactRow[]>;
  findDuplicateCandidates(ownerUserId: string, excludeId: string, probe: DuplicateProbe): Promise<ContactRow[]>;
  insert(input: ContactInsert): Promise<ContactRow>;
  update(ownerUserId: string, id: string, patch: ContactPatch): Promise<ContactRow | null>;
  delete(ownerUserId: string, id: string): Promise<boolean>;

  listJobLinks(contactId: string): Promise<ContactJobLinkRow[]>;
  upsertJobLink(contactId: string, jobId: string, stage: string): Promise<ContactJobLinkRow>;
  updateJobLinkStage(contactId: string, jobId: string, stage: string): Promise<ContactJobLinkRow | null>;
  deleteJobLink(contactId: string, jobId: string): Promise<boolean>;
  /** Move `from`'s job links onto `to`, skipping jobs `to` is already on. */
  moveJobLinks(fromContactId: string, toContactId: string): Promise<void>;
}

const DUPLICATE_SCAN_LIMIT = 20;

export class ContactsRepository implements IContactsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findById(ownerUserId: string, id: string): Promise<ContactRow | null> {
    const [row] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.ownerUserId, ownerUserId)))
      .limit(1);
    return row ?? null;
  }

  async findByEmail(ownerUserId: string, email: string): Promise<ContactRow | null> {
    const [row] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.ownerUserId, ownerUserId), sql`lower(${contacts.email}) = ${email.toLowerCase()}`))
      .limit(1);
    return row ?? null;
  }

  async list(ownerUserId: string, filters: ContactListFilters): Promise<ContactRow[]> {
    const conditions = [eq(contacts.ownerUserId, ownerUserId)];
    if (filters.lifecycle) conditions.push(eq(contacts.lifecycle, filters.lifecycle));
    if (filters.q) {
      const like = `%${filters.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      conditions.push(
        or(ilike(contacts.fullName, like), ilike(contacts.email, like), ilike(contacts.company, like))!,
      );
    }
    return this.db
      .select()
      .from(contacts)
      .where(and(...conditions))
      .orderBy(desc(contacts.updatedAt))
      .limit(filters.limit)
      .offset(filters.offset);
  }

  async findDuplicateCandidates(ownerUserId: string, excludeId: string, probe: DuplicateProbe): Promise<ContactRow[]> {
    const matchers = [];
    if (probe.fullName) matchers.push(sql`lower(${contacts.fullName}) = ${probe.fullName.trim().toLowerCase()}`);
    if (probe.phone) matchers.push(eq(contacts.phone, probe.phone));
    if (probe.linkedinUrl) matchers.push(eq(contacts.linkedinUrl, probe.linkedinUrl));
    if (matchers.length === 0) return [];
    return this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.ownerUserId, ownerUserId), ne(contacts.id, excludeId), or(...matchers)))
      .orderBy(contacts.createdAt)
      .limit(DUPLICATE_SCAN_LIMIT);
  }

  async insert(input: ContactInsert): Promise<ContactRow> {
    const [row] = await this.db.insert(contacts).values(input).returning();
    return row;
  }

  async update(ownerUserId: string, id: string, patch: ContactPatch): Promise<ContactRow | null> {
    const [row] = await this.db
      .update(contacts)
      .set({ ...patch, updatedAt: this.now() })
      .where(and(eq(contacts.id, id), eq(contacts.ownerUserId, ownerUserId)))
      .returning();
    return row ?? null;
  }

  async delete(ownerUserId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.ownerUserId, ownerUserId)))
      .returning({ id: contacts.id });
    return rows.length > 0;
  }

  async listJobLinks(contactId: string): Promise<ContactJobLinkRow[]> {
    return this.db
      .select()
      .from(contactJobLinks)
      .where(eq(contactJobLinks.contactId, contactId))
      .orderBy(desc(contactJobLinks.updatedAt));
  }

  async upsertJobLink(contactId: string, jobId: string, stage: string): Promise<ContactJobLinkRow> {
    const [row] = await this.db
      .insert(contactJobLinks)
      .values({ contactId, jobId, stage })
      .onConflictDoUpdate({
        target: [contactJobLinks.contactId, contactJobLinks.jobId],
        set: { stage, updatedAt: this.now() },
      })
      .returning();
    return row;
  }

  async updateJobLinkStage(contactId: string, jobId: string, stage: string): Promise<ContactJobLinkRow | null> {
    const [row] = await this.db
      .update(contactJobLinks)
      .set({ stage, updatedAt: this.now() })
      .where(and(eq(contactJobLinks.contactId, contactId), eq(contactJobLinks.jobId, jobId)))
      .returning();
    return row ?? null;
  }

  async deleteJobLink(contactId: string, jobId: string): Promise<boolean> {
    const rows = await this.db
      .delete(contactJobLinks)
      .where(and(eq(contactJobLinks.contactId, contactId), eq(contactJobLinks.jobId, jobId)))
      .returning({ id: contactJobLinks.id });
    return rows.length > 0;
  }

  async moveJobLinks(fromContactId: string, toContactId: string): Promise<void> {
    const existing: { jobId: string }[] = await this.db
      .select({ jobId: contactJobLinks.jobId })
      .from(contactJobLinks)
      .where(eq(contactJobLinks.contactId, toContactId));
    const taken = existing.map((r) => r.jobId);
    await this.db
      .update(contactJobLinks)
      .set({ contactId: toContactId, updatedAt: this.now() })
      .where(
        taken.length > 0
          ? and(eq(contactJobLinks.contactId, fromContactId), notInArray(contactJobLinks.jobId, taken))
          : eq(contactJobLinks.contactId, fromContactId),
      );
  }
}
