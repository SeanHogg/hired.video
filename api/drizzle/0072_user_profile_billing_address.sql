-- Adds the per-user billing/contact address to user_profiles.
--
-- Structured columns (one per field) so each can be queried, indexed, and
-- validated at the column level. Same shape used by Checkout, Settings →
-- Billing, and the Services marketplace.
--
-- Idempotent: re-running this migration after a partial rollout is a no-op.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS billing_full_name varchar(160);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS billing_company varchar(160);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS billing_line1 varchar(200);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS billing_line2 varchar(200);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS billing_city varchar(100);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS billing_state varchar(100);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS billing_postal_code varchar(20);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS billing_country varchar(2);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS billing_phone varchar(40);
