/**
 * The strip's document row takes its page count and paper from the stage
 * (docLayers.pageCounts + the kit's paper) — never re-measured from the DOM —
 * and titles itself per page ("Résumé pages" / "Letter pages").
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DocumentPages from "../DocumentPages";

describe("DocumentPages", () => {
  it("draws one tile per reported page, the first in view", () => {
    render(<DocumentPages page="resume" pages={3} paper="letter" />);
    const tiles = screen.getAllByRole("button");
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("list", { name: "Résumé pages" })).toBeInTheDocument();
    expect(screen.getByText("Letter size")).toBeInTheDocument();
  });

  it("titles the letter's row and its A4 paper, never fewer than one tile", () => {
    render(<DocumentPages page="letter" pages={0} paper="a4" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("list", { name: "Letter pages" })).toBeInTheDocument();
    expect(screen.getByText("A4 size")).toBeInTheDocument();
  });
});
