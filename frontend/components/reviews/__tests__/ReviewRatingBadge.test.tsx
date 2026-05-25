import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReviewRatingBadge } from "../ReviewRatingBadge";

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("<ReviewRatingBadge />", () => {
  it("renders nothing when count is 0 or missing", () => {
    const { container: c1 } = renderWithRouter(<ReviewRatingBadge value={4.5} count={0} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = renderWithRouter(<ReviewRatingBadge value={4.5} count={null} />);
    expect(c2.firstChild).toBeNull();

    const { container: c3 } = renderWithRouter(<ReviewRatingBadge value={4.5} count={undefined} />);
    expect(c3.firstChild).toBeNull();
  });

  it("renders the rating to 1 decimal place and the review count", () => {
    renderWithRouter(<ReviewRatingBadge value={4.234} count={12} />);
    expect(screen.getByText("4.2")).toBeInTheDocument();
    expect(screen.getByText("(12)")).toBeInTheDocument();
  });

  it("shows an em-dash when value is missing but count is positive", () => {
    renderWithRouter(<ReviewRatingBadge value={null} count={3} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("wraps in a Link when href is provided", () => {
    renderWithRouter(
      <ReviewRatingBadge value={4.5} count={2} href="/companies/acme/reviews" />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/companies/acme/reviews");
  });

  it("does not wrap in a Link when href is omitted", () => {
    renderWithRouter(<ReviewRatingBadge value={4.5} count={2} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("uses singular 'review' in the aria-label when count is 1", () => {
    renderWithRouter(<ReviewRatingBadge value={5} count={1} />);
    const labeled = screen.getByLabelText(/across 1 review/);
    expect(labeled).toBeInTheDocument();
  });

  it("uses plural 'reviews' in the aria-label when count > 1", () => {
    renderWithRouter(<ReviewRatingBadge value={5} count={2} />);
    const labeled = screen.getByLabelText(/across 2 reviews/);
    expect(labeled).toBeInTheDocument();
  });
});
