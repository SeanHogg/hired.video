-- Migration 0492 — paid activities on tasks (#243-adjacent / hire→work→pay loop).
--
-- Lets an employer assign a compensated "activity" to a person they've hired
-- (even part-time): a task the worker owns, tagged with a pay model and a
-- rate/amount, plus a small approval state machine. On approval the worker is
-- credited through the existing PayoutLedgerService (source_kind='task'), so
-- the money rides the same accrual → ReleaseWorker → Tremendous/Helcim rails
-- as gigs and workforce timesheets.
--
-- All ADD COLUMN use IF NOT EXISTS so this is a true no-op on any DB that
-- already has the columns (per drizzle/TEMPLATE.md idempotency rules).
-- CHECK constraints are added NOT VALID + gated on pg_constraint.
--
-- Drizzle SSoT: api/src/db/schema/productivity.ts (tasks).
-- Shared enums: shared/activities.ts (ACTIVITY_PAY_TYPES / ACTIVITY_STATUSES).

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "pay_type" varchar(8);            -- hourly | fixed (NULL = ordinary task)
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "rate_cents" integer;             -- hourly rate, minor units
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "amount_cents" integer;           -- fixed price, minor units
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "pay_currency" varchar(8) NOT NULL DEFAULT 'USD';
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "assigned_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "company_id" uuid REFERENCES "company_profiles"("id") ON DELETE SET NULL;
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "activity_status" varchar(12);    -- assigned | submitted | approved | rejected

-- Value-domain guards. NOT VALID so pre-existing rows (all NULL here) are
-- untouched; new writes are checked. Sourced from shared/activities.ts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_pay_type_check') THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_pay_type_check"
      CHECK ("pay_type" IS NULL OR "pay_type" IN ('hourly', 'fixed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_activity_status_check') THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_activity_status_check"
      CHECK ("activity_status" IS NULL OR "activity_status" IN ('assigned', 'submitted', 'approved', 'rejected')) NOT VALID;
  END IF;
END $$;

-- Employer's "activities in my company" board — all paid activities for a
-- company, any owner, newest first. Partial: only paid-activity rows carry
-- company_id, which is a tiny fraction of the tasks table.
CREATE INDEX IF NOT EXISTS "idx_tasks_company_activity"
  ON "tasks" ("company_id", "activity_status")
  WHERE "pay_type" IS NOT NULL;

-- Worker's "activities assigned to me" query rides the existing
-- idx_tasks_user_status (user_id, status, due_date); no new index needed.
