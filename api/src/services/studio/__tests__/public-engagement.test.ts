/**
 * Public playback engagement (#1586): the read a signed-out viewer of a
 * public studio project uses, and who may submit one of its forms.
 *
 * The rules run against a `PublicEngagementSource` fake seeded with
 * production-shaped rows (uuid ids, a lead-capture form with email + select
 * fields, chapters, scored thumbnail candidates). The SQL itself — the
 * public-project predicate and the active-forms filter — is pinned by
 * compiling the repository's fragments.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/public-engagement.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  invalidatePublicEngagement,
  readPublicEngagement,
  viewerMaySubmitToProject,
  type PublicEngagementAssets,
  type PublicEngagementSource,
} from "../public-engagement.js";
import {
  activeProjectFormsWhere,
  publicStudioProjectWhere,
} from "../../../repositories/studioPublicEngagementRepository.js";
import { __resetEdgeCacheForTests } from "../../../utils/edge-cache.js";

const OWNER = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const STRANGER = "9e2d4f61-7a8b-4c3d-8e9f-0a1b2c3d4e5f";
const PUBLIC_PROJECT = "7d3e2f10-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
const PRIVATE_PROJECT = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_PROJECT = "77777777-7777-4777-8777-777777777777";

const PUBLIC_ASSETS: PublicEngagementAssets = {
  forms: [
    {
      id: "3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44",
      projectId: PUBLIC_PROJECT,
      title: "Get the full case study",
      description: null,
      positionSeconds: 1,
      fields: [
        { key: "email", label: "Work email", type: "email", required: true },
        { key: "role", label: "Your role", type: "select", required: false, options: ["Recruiter", "Hiring manager"] },
      ],
      requireToContinue: true,
      submitButtonText: "Send it to me",
      redirectUrl: null,
      formType: "lead_capture",
    },
  ],
  chapters: [
    {
      id: "a2b9e4c1-5d7f-4e2a-8c3b-6f1d0e9a7b55",
      projectId: PUBLIC_PROJECT,
      title: "Results",
      startSeconds: 42.5,
      thumbnailUrl: null,
      orderIndex: 2,
    },
  ],
  thumbnails: [
    {
      id: "c4d5e6f7-0819-4a2b-9c3d-4e5f60718293",
      projectId: PUBLIC_PROJECT,
      imageUrl: "https://cdn.hired.video/thumbs/abc.jpg",
      sourceTimeSec: 3,
      headlineText: "Watch the demo",
      isSelected: true,
    },
  ],
};

/** Alice's public project + her private draft; she may act on both. */
function source(): PublicEngagementSource & { visibilityChecks: number; assetLoads: number } {
  const publicIds = new Set([PUBLIC_PROJECT]);
  const owners = new Map([[PUBLIC_PROJECT, OWNER], [PRIVATE_PROJECT, OWNER]]);
  return {
    visibilityChecks: 0,
    assetLoads: 0,
    async isPublicProject(projectId) {
      this.visibilityChecks += 1;
      return publicIds.has(projectId);
    },
    async listAssets(projectId) {
      this.assetLoads += 1;
      return projectId === PUBLIC_PROJECT ? structuredClone(PUBLIC_ASSETS) : { forms: [], chapters: [], thumbnails: [] };
    },
    async canActOnProject(actor, projectId) {
      return owners.get(projectId) === actor;
    },
  };
}

beforeEach(() => __resetEdgeCacheForTests());

describe("readPublicEngagement", () => {
  it("serves a public project's forms, chapters and thumbnails — and never review comments", async () => {
    const assets = await readPublicEngagement(PUBLIC_PROJECT, source());
    assert.ok(assets);
    assert.deepEqual(Object.keys(assets!).sort(), ["chapters", "forms", "thumbnails"]);
    assert.equal(assets!.forms[0].title, "Get the full case study");
    assert.equal(assets!.chapters[0].startSeconds, 42.5);
    assert.equal(assets!.thumbnails[0].imageUrl, "https://cdn.hired.video/thumbs/abc.jpg");
    assert.equal("comments" in assets!, false);
    // Viewer-safe projection: no answer key, owner id or storage key.
    assert.equal("answerKey" in assets!.forms[0], false);
    assert.equal("userId" in assets!.chapters[0], false);
    assert.equal("storageKey" in assets!.thumbnails[0], false);
  });

  it("answers null (→ 404) for a private project without loading its assets", async () => {
    const src = source();
    assert.equal(await readPublicEngagement(PRIVATE_PROJECT, src), null);
    assert.equal(src.assetLoads, 0);
  });

  it("answers null for an unknown project exactly like a private one (no existence leak)", async () => {
    assert.equal(await readPublicEngagement(UNKNOWN_PROJECT, source()), null);
  });

  it("answers null for a malformed id without touching the database", async () => {
    const src = source();
    for (const id of ["new", "", "not-a-uuid", "7d3e2f10-4b5a-4c6d-8e9f", `${PUBLIC_PROJECT}x`]) {
      assert.equal(await readPublicEngagement(id, src), null);
    }
    assert.equal(src.visibilityChecks, 0);
    assert.equal(src.assetLoads, 0);
  });

  it("caches the assets but re-checks visibility on every read", async () => {
    const src = source();
    await readPublicEngagement(PUBLIC_PROJECT, src);
    await readPublicEngagement(PUBLIC_PROJECT, src);
    assert.equal(src.assetLoads, 1);
    assert.equal(src.visibilityChecks, 2);
  });

  it("reloads after a write invalidates the project", async () => {
    const src = source();
    await readPublicEngagement(PUBLIC_PROJECT, src);
    invalidatePublicEngagement(PUBLIC_PROJECT);
    await readPublicEngagement(PUBLIC_PROJECT, src);
    assert.equal(src.assetLoads, 2);
  });

  it("stops serving the moment the project goes private, even with a warm cache", async () => {
    const src = source();
    assert.ok(await readPublicEngagement(PUBLIC_PROJECT, src));
    src.isPublicProject = async () => false;
    assert.equal(await readPublicEngagement(PUBLIC_PROJECT, src), null);
  });
});

describe("viewerMaySubmitToProject", () => {
  it("accepts an anonymous viewer on a public project", async () => {
    assert.equal(await viewerMaySubmitToProject(null, PUBLIC_PROJECT, source()), true);
  });

  it("accepts a signed-in stranger on a public project", async () => {
    assert.equal(await viewerMaySubmitToProject(STRANGER, PUBLIC_PROJECT, source()), true);
  });

  it("refuses an anonymous viewer and a stranger on a private project", async () => {
    assert.equal(await viewerMaySubmitToProject(null, PRIVATE_PROJECT, source()), false);
    assert.equal(await viewerMaySubmitToProject(STRANGER, PRIVATE_PROJECT, source()), false);
  });

  it("lets the owner submit while previewing a private draft", async () => {
    assert.equal(await viewerMaySubmitToProject(OWNER, PRIVATE_PROJECT, source()), true);
  });

  it("refuses a malformed project id", async () => {
    assert.equal(await viewerMaySubmitToProject(OWNER, "new", source()), false);
  });
});

describe("public engagement SQL", () => {
  const dialect = new PgDialect();

  it("the public-project predicate filters on studio_projects.is_public = true", () => {
    const q = dialect.sqlToQuery(publicStudioProjectWhere());
    assert.match(q.sql, /"is_public" = \$1/);
    assert.deepEqual(q.params, [true]);
  });

  it("the public form list excludes inactive forms", () => {
    const q = dialect.sqlToQuery(activeProjectFormsWhere(PUBLIC_PROJECT));
    assert.match(q.sql, /"project_id" = \$1/);
    assert.match(q.sql, /"is_active" = \$2/);
    assert.deepEqual(q.params, [PUBLIC_PROJECT, true]);
  });
});
