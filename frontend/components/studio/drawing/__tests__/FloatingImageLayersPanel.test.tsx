/**
 * Tests for the image-kind floating layers panel — pins the chrome
 * contract + the layer count display + that handler callbacks fire.
 *
 * User-reported regression context (2026-05-23): an earlier pass
 * mounted a SECOND layers panel in the DrawingStage right rail
 * alongside the host's existing `<FloatingLayersPanel/>` — duplicate
 * UI. This pass collapsed both into the shared
 * `<FloatingCollapsiblePanel/>` chrome with kind-specific bodies.
 * These tests lock the image side of that contract.
 *
 * Run: vitest run components/studio/drawing/__tests__/FloatingImageLayersPanel.test.tsx
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import FloatingImageLayersPanel from "../FloatingImageLayersPanel";
import { createBlankImageState } from "@shared/image-state";

function renderWithProviders(ui: React.ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

function makeHandlers() {
  return {
    onAddLayer: vi.fn(),
    onDeleteLayer: vi.fn(),
    onSelectLayer: vi.fn(),
    onToggleVisible: vi.fn(),
    onRenameLayer: vi.fn(),
    onSetOpacity: vi.fn(),
    onMoveLayer: vi.fn(),
  };
}

describe("FloatingImageLayersPanel — chrome", () => {
  it("renders the 'Layers' pill with the layer count", () => {
    const state = createBlankImageState(1080, 1080);
    render(<FloatingImageLayersPanel state={state} {...makeHandlers()} />);
    expect(screen.getByText("Layers")).toBeTruthy();
    // Blank state seeds one layer.
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("defaults to OPEN for image kind (the layers panel is primary on drawing)", () => {
    const state = createBlankImageState(1080, 1080);
    render(<FloatingImageLayersPanel state={state} {...makeHandlers()} />);
    // Background layer row should be rendered when expanded.
    expect(screen.getByText("Background")).toBeTruthy();
  });

  it("fires onAddLayer when the (+) button is clicked", () => {
    const handlers = makeHandlers();
    const state = createBlankImageState(1080, 1080);
    render(<FloatingImageLayersPanel state={state} {...handlers} />);
    const addBtn = screen.getByLabelText("Add layer");
    fireEvent.click(addBtn);
    expect(handlers.onAddLayer).toHaveBeenCalledTimes(1);
  });

  it("renders one row per layer (count updates with state)", () => {
    const base = createBlankImageState(1080, 1080);
    const state = {
      ...base,
      layers: [
        ...base.layers,
        {
          id: "l2",
          label: "Extra layer",
          kind: "raster" as const,
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: "normal" as const,
          pixelsDataUrl: null,
        },
      ],
    };
    render(<FloatingImageLayersPanel state={state} {...makeHandlers()} />);
    expect(screen.getByText("Background")).toBeTruthy();
    expect(screen.getByText("Extra layer")).toBeTruthy();
    // Count chip in the pill shows 2.
    expect(screen.getByText("2")).toBeTruthy();
  });
});
