/**
 * CreatorTemplatesPanel regression tests.
 *
 * Covers the contract that lets a creator manage their marketplace catalog
 * from inside the studio:
 *   • Empty state — guides the user to the publish flow.
 *   • Loaded state — each row self-gates its visibility-action affordances
 *     based on the template's current visibility (no parent canX boolean).
 *   • Republish + make-private flip the row in-place.
 *   • Republishing to public passes consentAccepted: true (backend
 *     requirement that the panel must own, not the consumer).
 *   • Delete confirms before calling the API.
 *
 * Run: vitest run components/__tests__/CreatorTemplatesPanel.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreatorTemplatesPanel from "@/components/studio/CreatorTemplatesPanel";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";

// Service mocks — vi.mock is hoisted, so the spies have to be created via
// vi.hoisted so the factory below can reference them without a TDZ error.
const { listMine, updateMock, deleteMock } = vi.hoisted(() => ({
  listMine: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));
vi.mock("@/lib/services/studio-templates-service", async (orig) => {
  const real = await orig<typeof import("@/lib/services/studio-templates-service")>();
  return {
    ...real,
    studioTemplatesService: {
      ...real.studioTemplatesService,
      listMine,
      update: updateMock,
      deleteById: deleteMock,
    },
  };
});

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function makeTemplate(overrides: Partial<StudioTemplate> = {}): StudioTemplate {
  return {
    id: overrides.id ?? "t1",
    creatorId: "u1",
    sourceProjectId: "p1",
    mediaKind: "video",
    name: overrides.name ?? "Resume — minimal",
    description: "A clean dark template.",
    thumbnailUrl: null,
    previewVideoUrl: null,
    videoScript: {},
    durationSec: 28,
    motion: "minimal",
    language: "en",
    tags: [],
    visibility: overrides.visibility ?? "public",
    listingSlug: "resume-minimal",
    priceCents: 0,
    currency: "USD",
    platformFeeBps: 1000,
    consentAgreedAt: "2026-04-01T00:00:00.000Z",
    viewCount: 12,
    purchaseCount: 3,
    publishedAt: "2026-04-01T00:00:00.000Z",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  listMine.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
});

describe("CreatorTemplatesPanel — empty + loading", () => {
  it("returns null content while open=false (panel only mounts when opened)", () => {
    listMine.mockResolvedValue([]);
    const { queryByText } = render(<CreatorTemplatesPanel open={false} onOpenChange={vi.fn()} />);
    expect(queryByText(/My published templates/i)).toBeNull();
  });

  it("shows the empty-state hint when the user has no templates", async () => {
    listMine.mockResolvedValue([]);
    render(<CreatorTemplatesPanel open={true} onOpenChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/haven't published any templates/i)).toBeInTheDocument();
    });
  });
});

describe("CreatorTemplatesPanel — row affordances self-gate by visibility", () => {
  it("public rows show 'Make private' but NOT 'Republish'", async () => {
    listMine.mockResolvedValue([makeTemplate({ visibility: "public" })]);
    render(<CreatorTemplatesPanel open={true} onOpenChange={vi.fn()} />);
    const card = await screen.findByText("Resume — minimal");
    const row  = card.closest("div.rounded-md")!;
    expect(within(row as HTMLElement).getByRole("button", { name: /Make private/i })).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByRole("button", { name: /Republish/i })).toBeNull();
    expect(within(row as HTMLElement).getByText(/View listing/i)).toBeInTheDocument();
  });

  it("private rows show 'Republish' but NOT 'Make private'", async () => {
    listMine.mockResolvedValue([makeTemplate({ visibility: "private" })]);
    render(<CreatorTemplatesPanel open={true} onOpenChange={vi.fn()} />);
    const card = await screen.findByText("Resume — minimal");
    const row  = card.closest("div.rounded-md")!;
    expect(within(row as HTMLElement).getByRole("button", { name: /Republish/i })).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByRole("button", { name: /Make private/i })).toBeNull();
    expect(within(row as HTMLElement).queryByText(/View listing/i)).toBeNull();
  });

  it("unlisted rows show BOTH Republish and Make private", async () => {
    listMine.mockResolvedValue([makeTemplate({ visibility: "unlisted" })]);
    render(<CreatorTemplatesPanel open={true} onOpenChange={vi.fn()} />);
    const card = await screen.findByText("Resume — minimal");
    const row  = card.closest("div.rounded-md")!;
    expect(within(row as HTMLElement).getByRole("button", { name: /Republish/i })).toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole("button", { name: /Make private/i })).toBeInTheDocument();
  });
});

describe("CreatorTemplatesPanel — actions", () => {
  it("Republish to public sends consentAccepted: true", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValue([makeTemplate({ visibility: "private" })]);
    updateMock.mockResolvedValue(makeTemplate({ visibility: "public" }));
    render(<CreatorTemplatesPanel open={true} onOpenChange={vi.fn()} />);
    const republish = await screen.findByRole("button", { name: /Republish/i });
    await user.click(republish);
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith("t1", { visibility: "public", consentAccepted: true });
  });

  it("Make private does NOT send consentAccepted (privacy doesn't need it)", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValue([makeTemplate({ visibility: "public" })]);
    updateMock.mockResolvedValue(makeTemplate({ visibility: "private" }));
    render(<CreatorTemplatesPanel open={true} onOpenChange={vi.fn()} />);
    const makePrivate = await screen.findByRole("button", { name: /Make private/i });
    await user.click(makePrivate);
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith("t1", { visibility: "private" });
  });

  it("delete asks for confirmation before calling the API", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValue([makeTemplate()]);
    deleteMock.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CreatorTemplatesPanel open={true} onOpenChange={vi.fn()} />);
    const trash = await screen.findByTitle(/Delete this template permanently/i);
    await user.click(trash);
    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    await user.click(trash);
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("t1"));
    confirmSpy.mockRestore();
  });
});
