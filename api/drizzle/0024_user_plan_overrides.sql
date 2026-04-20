CREATE TABLE IF NOT EXISTS "user_plan_overrides" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan_slug" varchar(50),
  "monthly_token_limit" integer,
  "expires_at" timestamptz,
  "reason" text NOT NULL,
  "granted_by" uuid NOT NULL REFERENCES "users"("id"),
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_plan_overrides_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX IF NOT EXISTS "user_plan_overrides_expires_at_idx"
  ON "user_plan_overrides" ("expires_at")
  WHERE "expires_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "user_plan_overrides_granted_by_idx"
  ON "user_plan_overrides" ("granted_by");
