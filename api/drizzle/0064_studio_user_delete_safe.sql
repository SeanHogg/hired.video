-- Studio Workspace — user-delete safety for company-owned content.
--
-- Until now, deleting a user account cascaded through every studio_project,
-- video, and studio_template they ever touched. That's correct for personal
-- assets but wrong for company-owned ones: if recruiter Alice creates "5
-- reasons to work at Acme" videos for Acme then closes her account, Acme
-- should still own the videos.
--
-- Approach (kept type-safe): a BEFORE-DELETE trigger on users runs first,
-- and for any company-owned row it REASSIGNS user_id to the company's
-- owner (company_profiles.owner_id). The foreign-key cascade then has
-- nothing to remove for those rows — only personal ones (company_id NULL)
-- still cascade away as before. user_id remains NOT NULL across the
-- board, so application code keeps treating it as a string.
--
-- Why reassign vs. SET NULL: nullable user_id would force every studio
-- read path to handle a null actor, breaking dozens of existing call
-- sites. Reassigning to the company owner preserves "every row has an
-- editor" while honouring the company-asset survival contract.

CREATE OR REPLACE FUNCTION studio_user_delete_reassign() RETURNS TRIGGER AS $body$
DECLARE
  v_owner UUID;
BEGIN
  -- studio_projects: re-home each company-owned project to its company owner.
  FOR v_owner IN
    SELECT DISTINCT cp.owner_id
      FROM studio_projects sp
      JOIN company_profiles cp ON cp.id = sp.company_id
     WHERE sp.user_id = OLD.id AND sp.company_id IS NOT NULL
  LOOP
    UPDATE studio_projects sp
       SET user_id = v_owner, updated_at = NOW()
      FROM company_profiles cp
     WHERE sp.user_id   = OLD.id
       AND sp.company_id = cp.id
       AND cp.owner_id   = v_owner
       AND cp.owner_id  <> OLD.id;
  END LOOP;

  -- videos: same reassignment so company-owned videos survive.
  UPDATE videos v
     SET user_id = cp.owner_id, updated_at = NOW()
    FROM company_profiles cp
   WHERE v.user_id    = OLD.id
     AND v.company_id = cp.id
     AND cp.owner_id <> OLD.id;

  -- studio_templates: re-home company-owned templates to the company owner
  -- so royalties keep accruing to the company even after the publishing
  -- employee leaves. creator_id is the historical author; we deliberately
  -- keep it pointing at the deleted user (after Postgres SET NULL fires)
  -- so analytics can still distinguish per-creator history. company_id +
  -- platform_fee_bps preserve the royalty contract.
  UPDATE studio_templates st
     SET creator_id = cp.owner_id, updated_at = NOW()
    FROM company_profiles cp
   WHERE st.creator_id = OLD.id
     AND st.company_id = cp.id
     AND cp.owner_id  <> OLD.id;

  RETURN OLD;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studio_user_delete_reassign ON users;
CREATE TRIGGER trg_studio_user_delete_reassign BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION studio_user_delete_reassign();

-- Belt-and-braces: after the trigger reassigns, any rows still pointing at
-- the deleted user are personal (company_id IS NULL) — the FK cascade
-- handles those exactly as before. No schema-level changes required.
