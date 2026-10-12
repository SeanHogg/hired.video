import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudioTemplateLinkCard } from "../StudioTemplateLinkCard";
import { TEMPLATE_CATALOG } from "@/lib/studio/templates/catalog";

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

const sizzleReel = TEMPLATE_CATALOG.find((t) => t.id === "sizzle_reel")!;
const podcastTrailer = TEMPLATE_CATALOG.find((t) => t.id === "podcast_trailer")!;

describe("<StudioTemplateLinkCard />", () => {
  it("links to /templates/:id", () => {
    renderWithRouter(<StudioTemplateLinkCard template={sizzleReel} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/templates/${sizzleReel.id}`);
  });

  it("renders the template label + description", () => {
    renderWithRouter(<StudioTemplateLinkCard template={sizzleReel} />);
    // Label may appear twice — once in the card title row, once in the
    // TemplateThumb mock-slide preview (e.g. sizzle_reel's preview has
    // "Sizzle Reel" baked in as design text). Both presences are fine.
    expect(screen.getAllByText(sizzleReel.label).length).toBeGreaterThan(0);
    expect(screen.getByText(sizzleReel.desc)).toBeInTheDocument();
  });

  it("renders MediaKindBadge for non-video templates (badge self-hides for video)", () => {
    renderWithRouter(<StudioTemplateLinkCard template={podcastTrailer} />);
    // MediaKindBadge label for podcast.
    expect(screen.getByText("Podcast")).toBeInTheDocument();
  });

  it("does not render MediaKindBadge for video templates", () => {
    const { container } = renderWithRouter(<StudioTemplateLinkCard template={sizzleReel} />);
    // No "Video" badge — MediaKindBadge returns null for video kind by design.
    expect(container.textContent).not.toMatch(/^Video$/);
  });
});
