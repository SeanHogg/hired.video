import { describe, it, expect } from "vitest";
import {
  sizeGroupFromDimensions,
  campaignSizeGroup,
  groupCampaignsBySize,
  categoryMatrix,
  dimensionsFromUnknown,
  dimensionsFromProject,
  dimensionsFromCreative,
  collectCampaignAssets,
} from "../creative-size";

describe("sizeGroupFromDimensions", () => {
  it("classifies 1:1 as square", () => {
    expect(sizeGroupFromDimensions(1080, 1080)).toBe("square");
  });

  it("classifies taller-than-wide as vertical", () => {
    expect(sizeGroupFromDimensions(1080, 1920)).toBe("vertical");
    expect(sizeGroupFromDimensions(1080, 1350)).toBe("vertical");
  });

  it("classifies wider-than-tall as landscape", () => {
    expect(sizeGroupFromDimensions(1920, 1080)).toBe("landscape");
    expect(sizeGroupFromDimensions(300, 250)).toBe("landscape");
  });
});

describe("campaignSizeGroup", () => {
  it("returns unspecified when there are no assets", () => {
    expect(campaignSizeGroup([])).toBe("unspecified");
  });

  it("returns the single group when every asset matches", () => {
    expect(campaignSizeGroup([{ width: 1080, height: 1080 }])).toBe("square");
  });

  it("returns mixed when assets span more than one group", () => {
    expect(
      campaignSizeGroup([
        { width: 1080, height: 1080 },
        { width: 1920, height: 1080 },
      ]),
    ).toBe("mixed");
  });
});

describe("groupCampaignsBySize", () => {
  it("buckets campaigns in SIZE_GROUP_ORDER and skips empty groups", () => {
    const grouped = groupCampaignsBySize([
      { id: "a", assets: [{ width: 1080, height: 1080 }] },
      { id: "b", assets: [{ width: 1920, height: 1080 }] },
      { id: "c", assets: [] },
      {
        id: "d",
        assets: [
          { width: 1080, height: 1080 },
          { width: 1080, height: 1920 },
        ],
      },
    ]);
    expect(grouped.map((g) => g.group)).toEqual(["landscape", "square", "mixed", "unspecified"]);
    expect(grouped.find((g) => g.group === "landscape")?.items.map((c) => c.id)).toEqual(["b"]);
    expect(grouped.find((g) => g.group === "vertical")).toBeUndefined();
  });
});

describe("categoryMatrix", () => {
  it("counts catalog hits and marks empty families as gaps", () => {
    const rows = categoryMatrix([
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
    ]);
    const broadcast = rows.find((r) => r.category === "broadcast");
    const story = rows.find((r) => r.category === "social-story");
    const display = rows.find((r) => r.category === "display-ad");
    expect(broadcast?.count).toBe(1);
    expect(broadcast?.gap).toBe(false);
    expect(story?.count).toBe(1);
    expect(display?.count).toBe(0);
    expect(display?.gap).toBe(true);
    expect(rows.some((r) => r.category === "custom")).toBe(false);
  });

  it("appends a Custom column for uncatalogued sizes", () => {
    const rows = categoryMatrix([{ width: 123, height: 456 }]);
    const custom = rows.find((r) => r.category === "custom");
    expect(custom).toEqual({ category: "custom", label: "Custom", count: 1, gap: false });
  });
});

describe("dimensionsFromUnknown / project / creative", () => {
  it("reads width/height off a plain object", () => {
    expect(dimensionsFromUnknown({ width: 1080, height: 1920 })).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("prefers timelineSpec over imageState on a project", () => {
    expect(
      dimensionsFromProject({
        timelineSpec: { width: 1080, height: 1080 },
        imageState: { width: 1920, height: 1080 },
      }),
    ).toEqual({ width: 1080, height: 1080 });
  });

  it("resolves a catalog format id and a WxH string", () => {
    expect(dimensionsFromCreative({ format: "portrait-1080p" })).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(dimensionsFromCreative({ format: "300x250" })).toEqual({ width: 300, height: 250 });
  });

  it("prefers metadata pixels over the format string", () => {
    expect(
      dimensionsFromCreative({
        format: "portrait-1080p",
        metadata: { width: 1200, height: 630 },
      }),
    ).toEqual({ width: 1200, height: 630 });
  });
});

describe("collectCampaignAssets", () => {
  it("merges metadata, projectIds, and linked creatives", () => {
    const projectsById = new Map([
      ["p1", { timelineSpec: { width: 1080, height: 1920 } }],
      ["p2", { imageState: { width: 1080, height: 1080 } }],
    ]);
    const assets = collectCampaignAssets({
      metadata: { width: 1920, height: 1080, projectIds: ["p2"] },
      projectIds: ["p1"],
      projectsById,
      creatives: [
        { format: "300x250" },
        { studioProjectId: "p1", format: null },
      ],
    });
    expect(assets).toEqual([
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      { width: 1080, height: 1080 },
      { width: 300, height: 250 },
      { width: 1080, height: 1920 },
    ]);
  });
});
