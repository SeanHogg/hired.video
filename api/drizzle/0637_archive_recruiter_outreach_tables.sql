-- 0637_archive_recruiter_outreach_tables.sql
--
-- W3-D2 (architecture remediation 2026-10-17): ONE sequence engine.
-- 0636 copied recruiter_outreach_sequences / recruiter_outreach_enrollments
-- into follow_up_* (ids kept) and every reader/writer now uses follow_up_*
-- (repositories/outreachSequencesRepository.ts maps the old response shape).
-- Their Drizzle declarations were removed, so push no longer manages them.
--
-- Archive-first, never DROP. No live table has a foreign key into either one
-- (the only inbound FK is enrollments -> sequences, which moves with them).
-- Restore with: ALTER TABLE archive.<t> SET SCHEMA public;

CREATE SCHEMA IF NOT EXISTS archive;

ALTER TABLE IF EXISTS public.recruiter_outreach_enrollments SET SCHEMA archive;
ALTER TABLE IF EXISTS public.recruiter_outreach_sequences SET SCHEMA archive;
