import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AudienceQuickLinks } from "../AudienceQuickLinks";
import { AUDIENCES } from "../audiences";

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("<AudienceQuickLinks />", () => {
  it("renders one link per registered audience", () => {
    renderWithRouter(<AudienceQuickLinks />);
    for (const a of AUDIENCES) {
      const link = screen.getByRole("link", { name: a.label });
      expect(link).toHaveAttribute("href", `/for/${a.id}`);
    }
  });

  it("renders the default title when none provided", () => {
    renderWithRouter(<AudienceQuickLinks />);
    expect(screen.getByText("Browse by audience")).toBeInTheDocument();
  });

  it("renders a custom title when provided", () => {
    renderWithRouter(<AudienceQuickLinks title="For your demographic" />);
    expect(screen.getByText("For your demographic")).toBeInTheDocument();
  });
});
