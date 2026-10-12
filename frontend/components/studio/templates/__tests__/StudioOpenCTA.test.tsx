import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudioOpenCTA } from "../StudioOpenCTA";

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("<StudioOpenCTA />", () => {
  it("with no templateId, links to /studio with default label", () => {
    renderWithRouter(<StudioOpenCTA />);
    const link = screen.getByRole("link", { name: /open the studio/i });
    expect(link).toHaveAttribute("href", "/studio");
  });

  it("with a templateId, links to /studio/new?contentTemplate=<id> with template-flavoured label", () => {
    renderWithRouter(<StudioOpenCTA templateId="sizzle_reel" />);
    const link = screen.getByRole("link", { name: /open in studio/i });
    expect(link).toHaveAttribute("href", "/studio/new?contentTemplate=sizzle_reel");
  });

  it("renders a custom label when provided", () => {
    renderWithRouter(<StudioOpenCTA label="Start your reel" />);
    expect(screen.getByRole("link", { name: /start your reel/i })).toBeInTheDocument();
  });

  it("renders the trailing arrow only when withArrow is true", () => {
    const { container, rerender } = renderWithRouter(<StudioOpenCTA />);
    // Without arrow: 1 svg (the Sparkles icon).
    expect(container.querySelectorAll("svg").length).toBe(1);
    rerender(
      <MemoryRouter>
        <StudioOpenCTA withArrow />
      </MemoryRouter>,
    );
    // With arrow: 2 svgs.
    expect(container.querySelectorAll("svg").length).toBe(2);
  });
});
