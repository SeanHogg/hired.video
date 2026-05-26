/**
 * SCORM asset proxy route regex unit tests.
 *
 * `app.ts` whitelists `GET /api/courses/scorm-asset/<userId>/<pkgId>/<path>`
 * as a public route so the SCO iframe can fetch its bundled assets
 * without our JWT (#1460). The regex MUST match every legitimate path
 * the upload pipeline can produce and MUST reject anything else —
 * otherwise either the iframe hand-shake breaks (false negative) OR a
 * caller can punch through the auth layer on an arbitrary route (false
 * positive).
 *
 * This test pins the regex shape so a future refactor of the auth
 * router can't silently narrow or widen it.
 *
 * Run: node --test routes/__tests__/courses-scorm-asset-route-regex.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// Mirror the regex from app.ts. Edit BOTH together when changing.
const COURSES_SCORM_ASSET_ROUTE =
  /^\/api\/courses\/scorm-asset\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/.+$/i;

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_UUID = "12345678-1234-1234-1234-123456789012";

describe("COURSES_SCORM_ASSET_ROUTE", () => {
  it("matches a top-level entry file under a userId/pkgId prefix", () => {
    assert.ok(
      COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/${VALID_UUID}/${OTHER_UUID}/index.html`,
      ),
    );
  });

  it("matches deeply nested asset paths (SCORM packages have subfolders)", () => {
    assert.ok(
      COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/${VALID_UUID}/${OTHER_UUID}/scormcontent/assets/styles/main.css`,
      ),
    );
  });

  it("matches uppercase + mixed-case hex characters in the uuids", () => {
    assert.ok(
      COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/${VALID_UUID.toUpperCase()}/${OTHER_UUID}/x.html`,
      ),
    );
  });

  it("rejects when the path component is missing entirely", () => {
    assert.ok(
      !COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/${VALID_UUID}/${OTHER_UUID}`,
      ),
    );
    assert.ok(
      !COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/${VALID_UUID}/${OTHER_UUID}/`,
      ),
    );
  });

  it("rejects when the userId is not a uuid", () => {
    assert.ok(
      !COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/not-a-uuid/${OTHER_UUID}/index.html`,
      ),
    );
    assert.ok(
      !COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/12345/${OTHER_UUID}/index.html`,
      ),
    );
  });

  it("rejects when the pkgId is not a uuid", () => {
    assert.ok(
      !COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/${VALID_UUID}/not-a-uuid/index.html`,
      ),
    );
  });

  it("rejects an attempt to escape the scorm-asset prefix", () => {
    // The regex doesn't reject `..` segments by itself — the handler does.
    // But the prefix anchor `^/api/courses/scorm-asset/` guarantees no
    // route OUTSIDE this prefix can match, which is what the whitelist
    // is actually gating.
    assert.ok(
      !COURSES_SCORM_ASSET_ROUTE.test("/api/courses/me/enrollments"),
    );
    assert.ok(
      !COURSES_SCORM_ASSET_ROUTE.test("/api/uploads/manifest.xml"),
    );
    assert.ok(
      !COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/${VALID_UUID}/${OTHER_UUID}`,
      ),
    );
  });

  it("rejects when the prefix has an extra path segment", () => {
    assert.ok(
      !COURSES_SCORM_ASSET_ROUTE.test(
        `/api/courses/scorm-asset/extra/${VALID_UUID}/${OTHER_UUID}/x.html`,
      ),
    );
  });
});
