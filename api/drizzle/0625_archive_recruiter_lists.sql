-- W3-D2 item 5: recruiter_lists / recruiter_list_members were backfilled
-- into lists / list_items by 0624 and no code reads them. Archive-first
-- (never DROP); restore with ALTER TABLE archive.<t> SET SCHEMA public.
-- The only inbound FK (members → lists) moves with the tables.

CREATE SCHEMA IF NOT EXISTS archive;

ALTER TABLE IF EXISTS public.recruiter_list_members SET SCHEMA archive;
ALTER TABLE IF EXISTS public.recruiter_lists SET SCHEMA archive;
