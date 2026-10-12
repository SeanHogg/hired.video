-- Migration 0493 — native contacts graph (TK10 integrations block).
--
-- hired.video now owns the contact graph that was removed in 0054 and
-- delegated to a sister product (BurnRateOS, retired 2026-10-03):
--   * contacts           — people an owner knows (inbox senders, sourcing
--                          leads, enriched lookups, manual entries); a
--                          platform user with the same email is linked.
--   * contact_job_links  — a contact's stage in one of the owner's jobs.
--   * person_merge_queue — (0123) now references contacts: duplicate people
--                          the reconciler scores land here per
--                          workspace_person_merge_policy.
--
-- Idempotent per drizzle/TEMPLATE.md. Enums: shared/contacts.ts.
-- Drizzle SSoT: api/src/db/schema/contacts.ts (+ taxonomies.ts for the queue).

CREATE TABLE IF NOT EXISTS "contacts" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_user_id"  uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "email"          varchar(320),
  "full_name"      varchar(255),
  "company"        varchar(255),
  "title"          varchar(255),
  "phone"          varchar(64),
  "linkedin_url"   text,
  "linked_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "lifecycle"      varchar(16) NOT NULL DEFAULT 'contact',
  "source"         varchar(32) NOT NULL DEFAULT 'manual',
  "notes"          text,
  "enriched_at"    timestamptz,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_contacts_owner_email"
  ON "contacts" ("owner_user_id", lower("email")) WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_contacts_owner_updated"
  ON "contacts" ("owner_user_id", "updated_at");
CREATE INDEX IF NOT EXISTS "idx_contacts_linked_user"
  ON "contacts" ("linked_user_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_lifecycle_check') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_lifecycle_check"
      CHECK ("lifecycle" IN ('contact', 'lead'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_source_check') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_source_check"
      CHECK ("source" IN ('manual', 'inbox', 'enrichment', 'sourcing'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "contact_job_links" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id"  uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "job_id"      uuid NOT NULL REFERENCES "job_items"("id") ON DELETE CASCADE,
  "stage"       varchar(32) NOT NULL DEFAULT 'sourced',
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_contact_job_links_contact_job"
  ON "contact_job_links" ("contact_id", "job_id");
CREATE INDEX IF NOT EXISTS "idx_contact_job_links_job"
  ON "contact_job_links" ("job_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_job_links_stage_check') THEN
    ALTER TABLE "contact_job_links" ADD CONSTRAINT "contact_job_links_stage_check"
      CHECK ("stage" IN ('sourced', 'contacted', 'replied', 'interviewing', 'offer', 'hired', 'rejected'));
  END IF;
END $$;

-- person_merge_queue rows now point at contacts. The queue never had a
-- writer before this migration, so NOT VALID only guards new writes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_merge_queue_target_contact_fkey') THEN
    ALTER TABLE "person_merge_queue" ADD CONSTRAINT "person_merge_queue_target_contact_fkey"
      FOREIGN KEY ("target_person_id") REFERENCES "contacts"("id") ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_merge_queue_source_contact_fkey') THEN
    ALTER TABLE "person_merge_queue" ADD CONSTRAINT "person_merge_queue_source_contact_fkey"
      FOREIGN KEY ("source_person_id") REFERENCES "contacts"("id") ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_merge_queue_status_check') THEN
    ALTER TABLE "person_merge_queue" ADD CONSTRAINT "person_merge_queue_status_check"
      CHECK ("status" IN ('pending', 'approved', 'rejected', 'merged', 'expired')) NOT VALID;
  END IF;
END $$;

-- One row per pair, whatever its status: a pair the owner rejected is never
-- re-queued by later upserts. (Merged pairs disappear with the source
-- contact via the cascade above.)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_person_merge_queue_pair"
  ON "person_merge_queue" ("target_person_id", "source_person_id");
