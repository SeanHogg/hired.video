/**
 * #950 — MediaPicker Library tab: loads the first page when opened, shows
 * per-asset metadata, loads the next page via the scroll sentinel with the
 * server's cursor, and stops at the last page.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MediaPickerLibrary from "@/components/shared/MediaPickerLibrary";
import { listMyAssetPage } from "@/lib/services/upload-service";
import type { UploadedAssetItem } from "@shared/uploaded-assets";

vi.mock("@/lib/services/upload-service", () => ({ listMyAssetPage: vi.fn() }));

const USER = "3b9f6d2e-8c41-4f7a-9e0d-5a1c2b3d4e5f";

function asset(i: number, extra: Partial<UploadedAssetItem> = {}): UploadedAssetItem {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    key: `uploads/${USER}/images/${i}.png`,
    url: `https://cdn.hired.video/uploads/${USER}/images/${i}.png`,
    kind: "image",
    contentType: "image/png",
    sizeBytes: 245_760,
    width: 1920,
    height: 1080,
    sourceProjectId: null,
    uploadedAt: "2026-10-09T15:30:00.000Z",
    ...extra,
  };
}

/** Captures the IntersectionObserver callback so a test can "scroll". */
let intersect: (() => void) | null = null;
class FakeObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe() {
    intersect = () => this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  intersect = null;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

describe("MediaPickerLibrary", () => {
  it("does not fetch until the tab is active", () => {
    render(<MediaPickerLibrary active={false} onPick={vi.fn()} />);
    expect(listMyAssetPage).not.toHaveBeenCalled();
  });

  it("shows metadata, pages with the cursor, and stops at the last page", async () => {
    (listMyAssetPage as Mock)
      .mockResolvedValueOnce({ items: [asset(1, { kind: "ai_image" }), asset(2)], nextCursor: "cursor-page-2" })
      .mockResolvedValueOnce({ items: [asset(3, { width: null, height: null })], nextCursor: null });
    const onPick = vi.fn();
    render(<MediaPickerLibrary active onPick={onPick} />);

    expect(await screen.findAllByText(/1920×1080/)).toHaveLength(2);
    expect(screen.getByText("AI")).toBeTruthy();
    expect(listMyAssetPage).toHaveBeenLastCalledWith({ cursor: null, limit: 40, kind: "images" });

    await waitFor(() => expect(intersect).not.toBeNull());
    await act(async () => intersect!());
    await waitFor(() => expect(listMyAssetPage).toHaveBeenCalledTimes(2));
    expect(listMyAssetPage).toHaveBeenLastCalledWith({ cursor: "cursor-page-2", limit: 40, kind: "images" });
    expect(await screen.findByText(/3 images/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(onPick).toHaveBeenCalledWith({
      url: asset(1).url,
      mediaType: "image",
      source: "ai",
      width: 1920,
      height: 1080,
    });
  });

  it("shows the empty state for a new account", async () => {
    (listMyAssetPage as Mock).mockResolvedValueOnce({ items: [], nextCursor: null });
    render(<MediaPickerLibrary active onPick={vi.fn()} />);
    expect(await screen.findByText(/No saved images yet/)).toBeTruthy();
  });

  it("offers a retry when the first page fails", async () => {
    (listMyAssetPage as Mock)
      .mockRejectedValueOnce(new Error("NETWORK_ERROR"))
      .mockResolvedValueOnce({ items: [asset(9)], nextCursor: null });
    render(<MediaPickerLibrary active onPick={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText(/1920×1080/)).toBeTruthy();
  });
});
