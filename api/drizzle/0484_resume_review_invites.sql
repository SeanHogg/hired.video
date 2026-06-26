-- Migration 0484 — reviewer display name on resume_reviews (review invites).
--
-- The invite flow now lets an owner invite specific contacts (platform users)
-- AND external people by email, with feedback tracked back to whoever provided
-- it. For an external email invitee there is no `users` row to resolve a name
-- from, so we capture the display name supplied at invite time (or by the guest
-- when they open the link) directly on the review. Owner-facing surfaces render
-- "Jane Doe (jane@x.com)" so the owner knows who left each comment.
ALTER TABLE "resume_reviews" ADD COLUMN IF NOT EXISTS "reviewer_name" varchar(160);
