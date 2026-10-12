/** Library media (sourceId) → URLs before a still export (media-source-urls.ts). */
import { describe, expect, it, vi } from "vitest";
import { defaultWidget, type Widget } from "@/lib/studio/editor-v2/canvas-state";

vi.mock("@/lib/timeline/api", () => ({
  nleApi: {
    listSources: vi.fn(async () => ({
      sources: [
        { id: "src-photo", url: "https://cdn.hired.video/uploads/u1/photo.jpg" },
        { id: "src-clip", url: "https://cdn.hired.video/uploads/u1/clip.mp4" },
        { id: "other", url: "https://cdn.hired.video/x.png" },
      ],
    })),
  },
}));

import { mediaSourceIds, resolveMediaSources, withMediaUrls } from "../media-source-urls";

function bySource(kind: "image" | "video", id: string): Widget {
  const w = defaultWidget(kind);
  if (w.params.kind === "image" || w.params.kind === "video") w.params.data.source = { kind: "sourceId", id };
  return { ...w, id: `w-${id}` };
}
const urlOf = (w: Widget) => (w.params.kind === "image" || w.params.kind === "video") && w.params.data.source.kind === "url" ? w.params.data.source.url : null;

describe("media-source-urls", () => {
  it("lists each library id once", () => {
    expect(mediaSourceIds([bySource("image", "a"), bySource("video", "b"), bySource("image", "a"), defaultWidget("text")])).toEqual(["a", "b"]);
  });

  it("swaps resolved ids for URLs and leaves the rest", () => {
    const [img, missing] = withMediaUrls([bySource("image", "a"), bySource("image", "gone")], new Map([["a", "https://x/a.png"]]));
    expect(urlOf(img)).toBe("https://x/a.png");
    expect(missing.params.kind === "image" && missing.params.data.source.kind).toBe("sourceId");
  });

  it("resolves images and videos from the studio media library", async () => {
    const out = await resolveMediaSources([bySource("image", "src-photo"), bySource("video", "src-clip")]);
    expect(out.map(urlOf)).toEqual(["https://cdn.hired.video/uploads/u1/photo.jpg", "https://cdn.hired.video/uploads/u1/clip.mp4"]);
  });
});
