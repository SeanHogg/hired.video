/**
 * buildShareAction (#2374) — every CardActions-based card hands the rich
 * ShareMenu its own title/text, so X / Email / WhatsApp intents are
 * prefilled instead of carrying a bare URL.
 */
import { describe, expect, it, vi } from "vitest";
import { buildShareAction } from "../card-share-action";
import { SHARE_NETWORKS } from "@shared/social-share";

describe("buildShareAction", () => {
  it("carries the card's title and text in the share payload, with an absolute URL", () => {
    const action = buildShareAction({
      entityUrl: "/resumes/9b2f6c1e-3d4a-4e5f-8a6b-7c8d9e0f1a2b",
      shareTitle: "Dana Okafor — Senior Product Designer",
      shareText: "Ten years shipping design systems for fintech teams.",
    });
    expect(action.share).toEqual({
      url: `${window.location.origin}/resumes/9b2f6c1e-3d4a-4e5f-8a6b-7c8d9e0f1a2b`,
      title: "Dana Okafor — Senior Product Designer",
      text: "Ten years shipping design systems for fintech teams.",
    });
    const x = SHARE_NETWORKS.find((n) => n.id === "x")!;
    expect(x.buildUrl(action.share!)).toContain(encodeURIComponent("Dana Okafor — Senior Product Designer"));
  });

  it("accepts a path without a leading slash (boundary)", () => {
    const action = buildShareAction({ entityUrl: "people/dana-okafor", shareTitle: "Dana Okafor" });
    expect(action.share?.url).toBe(`${window.location.origin}/people/dana-okafor`);
    expect(action.share?.text).toBeUndefined();
  });

  it("drops the rich payload when a host callback owns the share UX", () => {
    const onActions = vi.fn();
    const action = buildShareAction({ entityUrl: "/companies/acme", shareTitle: "Acme", onActions });
    expect(action.share).toBeUndefined();
    action.onClick?.({} as never);
    expect(onActions).toHaveBeenCalledOnce();
  });
});
