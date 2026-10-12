/**
 * R12 — Hub/editor "Published to" chips keep one row per network when
 * several cuts of the same project went out on that destination.
 */
import { describe, expect, it } from "vitest";
import {
  deduplicatePublications,
  type StudioPublication,
} from "@/lib/services/studio-service";

function pub(over: Partial<StudioPublication> & Pick<StudioPublication, "destination" | "publishedAt">): StudioPublication {
  return {
    status: "published",
    updatedAt: over.publishedAt,
    ...over,
  };
}

describe("deduplicatePublications", () => {
  it("keeps the latest publishedAt per destination", () => {
    const rows = [
      pub({ destination: "youtube", publishedAt: "2026-10-01T00:00:00.000Z", renderVariantId: "cut-a" }),
      pub({ destination: "youtube", publishedAt: "2026-10-11T00:00:00.000Z", renderVariantId: "cut-b" }),
      pub({ destination: "linkedin", publishedAt: "2026-10-05T00:00:00.000Z", renderVariantId: null }),
    ];
    const out = deduplicatePublications(rows);
    expect(out).toHaveLength(2);
    const yt = out.find((r) => r.destination === "youtube");
    expect(yt?.renderVariantId).toBe("cut-b");
    expect(out.find((r) => r.destination === "linkedin")?.renderVariantId).toBeNull();
  });

  it("returns a single row unchanged", () => {
    const rows = [pub({ destination: "profile", publishedAt: "2026-10-11T00:00:00.000Z" })];
    expect(deduplicatePublications(rows)).toEqual(rows);
  });
});
