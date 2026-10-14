/**
 * TemplateInlineBody — pins the linked-content `template` body is registered
 * and branches on the résumé vs studio discriminator.
 *
 * Run: vitest run components/studio/v2/inline-bodies/__tests__/template-inline-body.test.tsx
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getById = vi.fn();
vi.mock("@/lib/services/studio-templates-service", () => ({
  studioTemplatesService: { getById: (id: string) => getById(id) },
}));

import { LINKED_CONTENT_BODIES } from "../registry";
import TemplateInlineBody from "../TemplateInlineBody";

const STUDIO_ID = "0d8e1c55-2f6a-4b1e-8c3d-6a7b9e0f1a2b";
const RESUME_ID = "6f1c2a9e-0b7d-4e7a-9a51-3c2d1e0f9a88";

beforeEach(() => {
  getById.mockReset();
});

describe("LINKED_CONTENT_BODIES template", () => {
  it("registers a lazy body for the template kind", () => {
    expect(LINKED_CONTENT_BODIES.template).toBeTruthy();
  });
});

describe("TemplateInlineBody", () => {
  it("renders a studio template with the studio discriminator", async () => {
    getById.mockResolvedValue({
      id: STUDIO_ID,
      name: "Launch reel",
      mediaKind: "video",
      documentKind: null,
      thumbnailUrl: "https://cdn.example/thumb.jpg",
    });
    render(<TemplateInlineBody id={STUDIO_ID} />);
    await waitFor(() => {
      expect(screen.getByText("Launch reel")).toBeTruthy();
    });
    expect(screen.getByText("Studio template")).toBeTruthy();
    expect(screen.getByAltText("Launch reel")).toHaveAttribute(
      "src",
      "https://cdn.example/thumb.jpg",
    );
  });

  it("renders a résumé template with the resume discriminator", async () => {
    getById.mockResolvedValue({
      id: RESUME_ID,
      name: "Clinical Blue",
      mediaKind: "document",
      documentKind: "resume",
      thumbnailUrl: null,
    });
    render(<TemplateInlineBody id={RESUME_ID} />);
    await waitFor(() => {
      expect(screen.getByText("Clinical Blue")).toBeTruthy();
    });
    expect(screen.getByText("Resume template")).toBeTruthy();
  });

  it("shows an error when the row cannot load", async () => {
    getById.mockRejectedValue(new Error("nope"));
    render(<TemplateInlineBody id={STUDIO_ID} />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't load this template.")).toBeTruthy();
    });
  });
});
