/**
 * EndCapOverlay visibility tests. The overlay self-gates on the
 * shouldShowBranding result + the at-end flag — consumers render it
 * unconditionally and rely on it to return null when not entitled. This
 * is the contract every player surface (in-app preview, public share
 * page, fullscreen modal) depends on; if it bleeds through during
 * mid-playback, the user's content gets covered for ~1 frame on every
 * render tick. These tests pin both gates.
 *
 * Run: vitest run components/__tests__/EndCapOverlay.test.tsx
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EndCapOverlay from "@/components/studio/EndCapOverlay";

describe("EndCapOverlay", () => {
  it("renders the branded card when at end and branding is allowed", () => {
    render(<EndCapOverlay atEnd={true} showBranding={true} onReplay={vi.fn()} />);
    expect(screen.getByTestId("end-cap-overlay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replay/i })).toBeInTheDocument();
    expect(screen.getByText("hired.video")).toBeInTheDocument();
  });

  it("returns null when not at the end of playback", () => {
    const { container } = render(
      <EndCapOverlay atEnd={false} showBranding={true} onReplay={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("returns null when branding is suppressed (Pro opt-out)", () => {
    const { container } = render(
      <EndCapOverlay atEnd={true} showBranding={false} onReplay={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onReplay when the user clicks Replay", async () => {
    const onReplay = vi.fn();
    const user = userEvent.setup();
    render(<EndCapOverlay atEnd={true} showBranding={true} onReplay={onReplay} />);
    await user.click(screen.getByRole("button", { name: /replay/i }));
    expect(onReplay).toHaveBeenCalledTimes(1);
  });
});
