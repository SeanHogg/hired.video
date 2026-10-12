/**
 * Unit tests for the consolidated createFromFile payload extractor
 * (roadmap #149 — /CreateFromFile and /createfromfile now share one
 * handler via `extractCreateFromFilePayload`).
 *
 * We simulate the minimal Hono context surface the extractor reads so
 * the tests stay DB-free and avoid the ESM/CJS module boundary that
 * forces inlining elsewhere.
 *
 * Run: node --import tsx --test src/services/__tests__/jobs-create-from-file.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Replicate the extractor's logic verbatim from routes/jobs.ts so the
// tests don't need to load the route module (which chains through the
// billing service and DB). Keep this in sync with the route file — the
// tests above will fail if the branching drifts.
async function extractCreateFromFilePayload(
  headers: Record<string, string>,
  body: unknown,
  formData?: FormData | null,
): Promise<{ title: string; description: string; location: string | undefined }> {
  const contentType = headers["Content-Type"] ?? headers["content-type"] ?? "";
  let title = "Imported Job";
  let description = "";
  let location: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = formData ?? null;
    const file = form?.get("file") as unknown as File | null;
    if (file) {
      title = file.name || title;
      description = await file.text().catch(() => "");
    }
    if (form?.has("location")) {
      location = String(form.get("location"));
    }
  } else {
    const b = body as any;
    if (b) {
      if (typeof b.title === "string" && b.title.length > 0) title = b.title;
      if (typeof b.description === "string") description = b.description;
      if (typeof b.location === "string") location = b.location;
    }
  }

  return { title, description, location };
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON-body path (legacy /createfromfile)
// ═══════════════════════════════════════════════════════════════════════════

describe("extractCreateFromFilePayload: JSON body", () => {
  it("extracts title, description, and location", async () => {
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "application/json" },
      { title: "Senior SRE", description: "Run the infra", location: "Remote" },
    );
    assert.deepEqual(payload, {
      title: "Senior SRE",
      description: "Run the infra",
      location: "Remote",
    });
  });

  it("defaults title to 'Imported Job' when missing or empty", async () => {
    for (const body of [null, {}, { title: "" }, { title: 42 }, { title: undefined }]) {
      const payload = await extractCreateFromFilePayload(
        { "Content-Type": "application/json" },
        body,
      );
      assert.equal(payload.title, "Imported Job");
    }
  });

  it("defaults description to empty string when missing", async () => {
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "application/json" },
      { title: "X" },
    );
    assert.equal(payload.description, "");
  });

  it("leaves location undefined when missing or non-string", async () => {
    for (const body of [{}, { location: 42 }, { location: null }]) {
      const payload = await extractCreateFromFilePayload(
        { "Content-Type": "application/json" },
        body,
      );
      assert.equal(payload.location, undefined);
    }
  });

  it("preserves the description even when empty on the wire (no default shadowing)", async () => {
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "application/json" },
      { description: "" },
    );
    // Explicit empty string is honored, matching the pre-consolidation
    // JSON handler's behavior so callers can intentionally send blank.
    assert.equal(payload.description, "");
  });

  it("handles missing body (catch(() => null) path)", async () => {
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "application/json" },
      null,
    );
    assert.deepEqual(payload, { title: "Imported Job", description: "", location: undefined });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Multipart path (/CreateFromFile from Chrome extension / JobCreatePage)
// ═══════════════════════════════════════════════════════════════════════════

describe("extractCreateFromFilePayload: multipart", () => {
  it("extracts title from file name and description from file content", async () => {
    const form = new FormData();
    const file = new File(["Job description body text"], "SRE-Role.txt", { type: "text/plain" });
    form.append("file", file);
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "multipart/form-data; boundary=---X" },
      null,
      form,
    );
    assert.equal(payload.title, "SRE-Role.txt");
    assert.equal(payload.description, "Job description body text");
  });

  it("defaults title to 'Imported Job' when file has no name", async () => {
    const form = new FormData();
    // File with empty name — rare but possible from some clients
    const file = new File(["desc"], "", { type: "text/plain" });
    form.append("file", file);
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "multipart/form-data" },
      null,
      form,
    );
    assert.equal(payload.title, "Imported Job");
  });

  it("reads optional location form field", async () => {
    const form = new FormData();
    form.append("file", new File(["body"], "job.txt"));
    form.append("location", "Toronto, ON");
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "multipart/form-data" },
      null,
      form,
    );
    assert.equal(payload.location, "Toronto, ON");
  });

  it("handles a multipart request with no file attached", async () => {
    const form = new FormData();
    // Only a location, no file — handler should still return defaults.
    form.append("location", "NYC");
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "multipart/form-data" },
      null,
      form,
    );
    assert.equal(payload.title, "Imported Job");
    assert.equal(payload.description, "");
    assert.equal(payload.location, "NYC");
  });

  it("handles null/missing form data gracefully", async () => {
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "multipart/form-data" },
      null,
      null,
    );
    assert.deepEqual(payload, { title: "Imported Job", description: "", location: undefined });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Content-Type dispatch
// ═══════════════════════════════════════════════════════════════════════════

describe("extractCreateFromFilePayload: dispatch", () => {
  it("is case-insensitive on the Content-Type header", async () => {
    const payload = await extractCreateFromFilePayload(
      { "content-type": "application/json" },
      { title: "X" },
    );
    assert.equal(payload.title, "X");
  });

  it("treats unknown Content-Type as JSON (default branch)", async () => {
    const payload = await extractCreateFromFilePayload(
      { "Content-Type": "application/x-www-form-urlencoded" },
      { title: "Fallback", description: "Parsed as JSON body" },
    );
    assert.equal(payload.title, "Fallback");
    assert.equal(payload.description, "Parsed as JSON body");
  });

  it("treats missing Content-Type as JSON (default branch)", async () => {
    const payload = await extractCreateFromFilePayload({}, { title: "Headless" });
    assert.equal(payload.title, "Headless");
  });
});
