/**
 * studioProjectColumns — every studio_projects read/RETURNING projects the
 * live columns only: the eight frozen legacy per-kind JSONB columns
 * (migration 0610) are never selected, and nothing the project DTO reads
 * goes missing.
 *
 * Run: node --import tsx --test src/repositories/__tests__/studio-project-columns.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTableColumns } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { studioProjectColumns } from "../studioProjectColumns.js";

const LEGACY_SQL_COLUMNS = [
  "timeline_spec",
  "game_state",
  "comic_state",
  "image_state",
  "animation_state",
  "cad_state",
  "cad_3d_state",
  "document_state",
];

const sqlNames = Object.values(studioProjectColumns).map((c) => c.name);

describe("studioProjectColumns", () => {
  it("never selects a frozen legacy column", () => {
    for (const legacy of LEGACY_SQL_COLUMNS) assert.ok(!sqlNames.includes(legacy), `${legacy} must not be projected`);
  });

  it("keeps every column the project DTO and use cases read", () => {
    for (const key of [
      "id", "userId", "companyId", "kind", "mediaKind", "state", "interactiveComicState", "storyboard",
      "resumeText", "name", "purpose", "slug", "status", "videoId", "isPublic", "revision", "bakedHash",
      "createdAt", "updatedAt",
    ]) {
      assert.ok(key in studioProjectColumns, `${key} must be projected`);
    }
  });

  it("is exactly the table minus the legacy columns (boundary: a new live column is picked up automatically)", () => {
    const all = Object.values(getTableColumns(schema.studioProjects)).map((c) => c.name);
    assert.deepEqual(
      [...sqlNames].sort(),
      all.filter((n) => !LEGACY_SQL_COLUMNS.includes(n)).sort(),
    );
  });
});
