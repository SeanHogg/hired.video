/**
 * Overlay media → `content.metaData` write-back (#2153): dropping an image or
 * video on a résumé item upserts ONE metaData row bound by the item's stable
 * id, survives section reorder, re-binds (not duplicates) when the overlay
 * moves, and never touches skillEvidence or the sections.
 *
 * Run: vitest run lib/studio/document/__tests__/resume-media-binding.test.ts
 */
import { describe, expect, it } from "vitest";
import { removeBoundMedia, resolveMediaBinding, upsertBoundMedia } from "../resume-media-binding";
import { EDUCATION_ID, OWNER_ID, PROJECT_ID, WORK_ACME_ID, WORK_STRIPE_ID, resumeFixture } from "./resume-fixture";

const NOW = () => "2026-10-10T12:00:00.000Z";
const image = (overlayId: string) => ({ overlayId, url: "https://cdn.hired.video/studio/abc.png", kind: "image" as const, userId: OWNER_ID });

describe("upsertBoundMedia — happy path", () => {
  it("appends one image row bound to the item's id; everything else is the same reference", () => {
    const before = resumeFixture();
    const result = upsertBoundMedia(before, WORK_ACME_ID, image("w_overlay_1"), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binding).toEqual({ referenceId: WORK_ACME_ID, itemType: "work" });
    expect(result.content.metaData).toHaveLength(4);
    expect(result.content.metaData?.slice(0, 3)).toEqual(before.metaData);
    expect(result.content.metaData?.[3]).toEqual({
      id: "w_overlay_1",
      userId: OWNER_ID,
      referenceId: WORK_ACME_ID,
      name: "",
      metaType: 5,
      url: "https://cdn.hired.video/studio/abc.png",
      createdAt: NOW(),
    });
    expect(result.content.skillEvidence).toBe(before.skillEvidence);
    expect(result.content.work).toBe(before.work);
    expect(result.content.basics).toBe(before.basics);
  });

  it("binds a seed-derived uuid item and an `item_` id item", () => {
    const edu = upsertBoundMedia(resumeFixture(), EDUCATION_ID, image("o1"), NOW);
    expect(edu.ok && edu.binding).toEqual({ referenceId: EDUCATION_ID, itemType: "education" });
    const project = upsertBoundMedia(resumeFixture(), PROJECT_ID, image("o2"), NOW);
    expect(project.ok && project.binding).toEqual({ referenceId: PROJECT_ID, itemType: "project" });
  });

  it("survives a section reorder — the row still names the same item", () => {
    const bound = upsertBoundMedia(resumeFixture(), WORK_STRIPE_ID, image("o3"), NOW);
    if (!bound.ok) throw new Error("bind failed");
    const reordered = { ...bound.content, work: [...bound.content.work].reverse() };
    const row = reordered.metaData?.find((r) => r.id === "o3");
    expect(row?.referenceId).toBe(WORK_STRIPE_ID);
    expect(reordered.work.find((w) => w.id === row?.referenceId)?.name).toBe("Stripe");
    expect(resolveMediaBinding(reordered, WORK_STRIPE_ID)).toEqual({ referenceId: WORK_STRIPE_ID, itemType: "work" });
  });
});

describe("upsertBoundMedia — boundaries", () => {
  it("moving the overlay onto another item re-binds the same row (no duplicate), keeping its createdAt", () => {
    const first = upsertBoundMedia(resumeFixture(), WORK_ACME_ID, image("o4"), NOW);
    if (!first.ok) throw new Error("bind failed");
    const moved = upsertBoundMedia(first.content, PROJECT_ID, image("o4"), () => "2027-01-01T00:00:00.000Z");
    if (!moved.ok) throw new Error("rebind failed");
    const rows = moved.content.metaData?.filter((r) => r.id === "o4") ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ referenceId: PROJECT_ID, createdAt: NOW() });
  });

  it("records a video by its container", () => {
    const mp4 = upsertBoundMedia(resumeFixture(), WORK_ACME_ID, { overlayId: "v1", url: "https://cdn.hired.video/a.mp4", kind: "video", userId: OWNER_ID }, NOW);
    const webm = upsertBoundMedia(resumeFixture(), WORK_ACME_ID, { overlayId: "v2", url: "https://cdn.hired.video/a.webm?sig=1", kind: "video", userId: OWNER_ID }, NOW);
    expect(mp4.ok && mp4.content.metaData?.at(-1)?.metaType).toBe(1);
    expect(webm.ok && webm.content.metaData?.at(-1)?.metaType).toBe(2);
  });

  it("starts the metaData list on a résumé that has none", () => {
    const { metaData: _none, ...bare } = resumeFixture();
    const result = upsertBoundMedia(bare, WORK_STRIPE_ID, image("o5"), NOW);
    expect(result.ok && result.content.metaData?.map((r) => r.id)).toEqual(["o5"]);
  });

  it("removes exactly the overlay's row, and is a no-op for an unknown one", () => {
    const before = resumeFixture();
    expect(removeBoundMedia(before, "missing")).toBe(before);
    const after = removeBoundMedia(before, "m-vid-1");
    expect(after.metaData?.map((r) => r.id)).toEqual(["m-img-1", "m-link-1"]);
    expect(after.skillEvidence).toBe(before.skillEvidence);
  });
});

describe("upsertBoundMedia — refusals", () => {
  it("refuses an id no item has (stale binding, skills have no media)", () => {
    expect(upsertBoundMedia(resumeFixture(), "not-an-item", image("o6"), NOW)).toEqual({ ok: false, reason: "unknown-item" });
    expect(upsertBoundMedia(resumeFixture(), "sk1", image("o7"), NOW)).toEqual({ ok: false, reason: "unknown-item" });
  });

  it("refuses an empty url", () => {
    expect(upsertBoundMedia(resumeFixture(), WORK_ACME_ID, { ...image("o8"), url: "  " }, NOW)).toEqual({ ok: false, reason: "empty-url" });
  });
});
