/**
 * Scene-boundary visualization for the Engagement tab.
 *
 * Run: vitest run components/engagement/__tests__/SceneBoundaryTrack.test.tsx
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SceneBoundaryTrack } from "../SceneBoundaryTrack";

describe("SceneBoundaryTrack", () => {
  it("lists each scene title and start timestamp", () => {
    render(
      <SceneBoundaryTrack
        seed={{
          sceneBoundaries: [
            { title: "Hook", start: 0 },
            { title: "Proof", start: 3 },
          ],
          durationSec: 8,
        }}
      />,
    );
    const rows = screen.getAllByTestId("scene-boundary");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("0:00");
    expect(rows[0]).toHaveTextContent("Hook");
    expect(rows[1]).toHaveTextContent("0:03");
    expect(rows[1]).toHaveTextContent("Proof");
    expect(screen.getByTestId("scene-boundary-duration")).toHaveTextContent("0:08");
  });

  it("shows an empty state when there are no scenes", () => {
    render(
      <SceneBoundaryTrack seed={{ sceneBoundaries: [], durationSec: 0 }} />,
    );
    expect(screen.getByTestId("scene-boundary-track")).toHaveTextContent(
      /no scene boundaries/i,
    );
    expect(screen.queryAllByTestId("scene-boundary")).toHaveLength(0);
  });
});
