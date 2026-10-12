/**
 * #274/#275 — the entity page canvas self-gates: visitors see the public
 * design or the page's standard view; owners get the start card, or their
 * design with Edit / Show-to-visitors.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  isOwner: false,
  result: { doc: null as unknown, loading: false, setPublic: vi.fn() },
}));
vi.mock("@/lib/use-entity-ownership", () => ({ useEntityOwnership: () => ({ isOwner: mocks.isOwner }) }));
vi.mock("@/lib/studio/document/use-entity-document", () => ({ useEntityDocument: () => mocks.result }));
vi.mock("@/components/studio/document/DocumentPagedView", () => ({
  default: () => <div>canvas-render</div>,
}));

import EntityDocumentCanvas from "../EntityDocumentCanvas";

const COMPANY_ID = "c7a1e5d3-2b4f-4a6c-8e9d-0f1a2b3c4d5e";
const doc = (isPublic: boolean) => ({
  project: { id: "p1", isPublic },
  state: { entityKind: "company", pages: [] },
  content: { name: "Northwind Labs" },
});

function renderCanvas() {
  return render(
    <MemoryRouter>
      <EntityDocumentCanvas subject={{ kind: "company", id: COMPANY_ID }} ownerUserId="u-owner">
        <div>standard-page</div>
      </EntityDocumentCanvas>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.isOwner = false;
  mocks.result = { doc: null, loading: false, setPublic: vi.fn() };
});

describe("EntityDocumentCanvas", () => {
  it("visitor + public design → the design replaces the standard view", () => {
    mocks.result.doc = doc(true);
    renderCanvas();
    expect(screen.getByText("canvas-render")).toBeInTheDocument();
    expect(screen.queryByText("standard-page")).toBeNull();
    expect(screen.queryByText("Edit on canvas")).toBeNull();
  });

  it("visitor + no design → the standard view, no owner chrome", () => {
    renderCanvas();
    expect(screen.getByText("standard-page")).toBeInTheDocument();
    expect(screen.queryByText("Open the canvas")).toBeNull();
  });

  it("owner + no design → a start card that opens the company on the canvas", () => {
    mocks.isOwner = true;
    renderCanvas();
    expect(screen.getByText("Design your company page on the canvas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the canvas" })).toHaveAttribute(
      "href",
      `/studio?editCompany=${COMPANY_ID}`,
    );
    expect(screen.getByText("standard-page")).toBeInTheDocument();
  });

  it("owner + private design → the design, the private note, edit + visibility controls", () => {
    mocks.isOwner = true;
    mocks.result.doc = doc(false);
    renderCanvas();
    expect(screen.getByText("canvas-render")).toBeInTheDocument();
    expect(screen.getByText(/Only you can see this design/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Show to visitors" })).not.toBeChecked();
    expect(screen.getByRole("link", { name: /Edit on canvas/ })).toHaveAttribute("href", `/studio?editCompany=${COMPANY_ID}`);
  });

  it("while loading → the standard view (no flash of owner chrome)", () => {
    mocks.isOwner = true;
    mocks.result.loading = true;
    renderCanvas();
    expect(screen.getByText("standard-page")).toBeInTheDocument();
    expect(screen.queryByText("Open the canvas")).toBeNull();
  });
});
