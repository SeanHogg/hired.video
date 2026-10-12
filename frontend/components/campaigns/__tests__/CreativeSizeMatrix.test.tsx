import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CreativeSizeMatrix } from "../CreativeSizeMatrix";

describe("<CreativeSizeMatrix />", () => {
  it("renders catalog labels and marks empty families as gaps", () => {
    const { container } = render(
      <CreativeSizeMatrix assets={[{ width: 1920, height: 1080 }]} />,
    );
    expect(screen.getByText("Broadcast")).toBeInTheDocument();
    expect(screen.getByText("Display ad")).toBeInTheDocument();
    const gapCells = container.querySelectorAll('td[data-gap="true"]');
    expect(gapCells.length).toBeGreaterThan(0);
    const filled = container.querySelectorAll('td[data-gap="false"]');
    expect([...filled].some((td) => td.textContent === "1")).toBe(true);
  });

  it("shows a Custom column for uncatalogued sizes", () => {
    render(<CreativeSizeMatrix assets={[{ width: 111, height: 222 }]} />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });
});
