-- Gap #930 Phase 2 — 3D CAD modelling runtime
--
-- Adds the parallel JSONB state column for `mediaKind: "cad_3d"` projects.
-- Mirrors the existing `cad_state` column convention; null for every non-
-- cad_3d project. Shape lives in `shared/cad-3d-state.ts` (primitive solids
-- + boolean ops + materials + build-volume hint).

ALTER TABLE "studio_projects" ADD COLUMN IF NOT EXISTS "cad_3d_state" jsonb;
