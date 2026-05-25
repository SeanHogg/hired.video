/**
 * Tests for artifact-view-service — pins the URL contract for the view
 * beacon. Regression guard for the 405 we hit when navigator.sendBeacon
 * was called with a relative "/api/..." path: the Pages worker on
 * hired.video does not own /api/*, only the api.hired.video Hono
 * worker does, so the beacon must be sent as an absolute URL rooted at
 * runtimeConfig.apiUrl.
 *
 * Run: vitest run lib/services/__tests__/artifact-view-service.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as apiClientModule from "@/lib/api-client";
import { runtimeConfig } from "@/lib/runtime-config";
import { sendArtifactViewBeacon } from "@/lib/services/artifact-view-service";
import type { ArtifactViewBeacon } from "@shared/artifact-views";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof apiClientModule>("@@/lib/api-client");
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
      getRaw: vi.fn(),
      requestRaw: vi.fn(),
    },
  } as unknown as typeof apiClientModule;
});

const apiClient = (apiClientModule as any).apiClient as {
  post: ReturnType<typeof vi.fn>;
};

const BEACON_PATH = "/api/analytics/artifacts/beacon";

const fixture: ArtifactViewBeacon = {
  artifactKind: "resume",
  artifactId: "00000000-0000-0000-0000-000000000001",
  engagement: [1, 1, 1],
  totalEngagementSec: 3,
  percentConsumed: 0.5,
  dropOffBucket: null,
};

const ORIGINAL_SEND_BEACON = (navigator as any).sendBeacon;

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom doesn't ship navigator.sendBeacon — define it per test so we
  // can assert against the spy and toggle the success branch.
  (navigator as any).sendBeacon = vi.fn(() => true);
});

afterEach(() => {
  if (ORIGINAL_SEND_BEACON === undefined) {
    delete (navigator as any).sendBeacon;
  } else {
    (navigator as any).sendBeacon = ORIGINAL_SEND_BEACON;
  }
});

describe("sendArtifactViewBeacon — URL contract", () => {
  it("calls navigator.sendBeacon with an ABSOLUTE URL rooted at runtimeConfig.apiUrl", async () => {
    const sendBeacon = (navigator as any).sendBeacon as ReturnType<typeof vi.fn>;

    await sendArtifactViewBeacon(fixture);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url] = sendBeacon.mock.calls[0];

    // The regression: a relative path here means the request hits whichever
    // origin the page is loaded on (hired.video) instead of the API worker
    // (api.hired.video), producing the 405 we saw in prod.
    expect(typeof url).toBe("string");
    expect(url.startsWith("/")).toBe(false);

    const expectedBase = runtimeConfig.apiUrl.replace(/\/$/, "");
    expect(url).toBe(`${expectedBase}${BEACON_PATH}`);
  });

  it("never double-slashes when runtimeConfig.apiUrl has a trailing slash", async () => {
    const sendBeacon = (navigator as any).sendBeacon as ReturnType<typeof vi.fn>;
    const spy = vi
      .spyOn(runtimeConfig, "apiUrl", "get")
      .mockReturnValue("https://api.hired.video/");

    try {
      await sendArtifactViewBeacon(fixture);
      const [url] = sendBeacon.mock.calls[0];
      expect(url).toBe(`https://api.hired.video${BEACON_PATH}`);
      expect(url).not.toContain("//api/");
    } finally {
      spy.mockRestore();
    }
  });

  it("sends the beacon body as a JSON Blob (sendBeacon doesn't let us set Content-Type)", async () => {
    const sendBeacon = (navigator as any).sendBeacon as ReturnType<typeof vi.fn>;

    await sendArtifactViewBeacon(fixture);

    const [, blob] = sendBeacon.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe("application/json");
    // jsdom doesn't implement Blob.text() / Response.text() against a Blob
    // body, but FileReader works. Round-trip through it to read the bytes.
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob as Blob);
    });
    expect(JSON.parse(text)).toEqual(fixture);
  });

  it("does NOT also call apiClient.post when sendBeacon returns true", async () => {
    await sendArtifactViewBeacon(fixture);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

describe("sendArtifactViewBeacon — fallback", () => {
  it("falls back to apiClient.post when navigator.sendBeacon is unavailable", async () => {
    delete (navigator as any).sendBeacon;

    await sendArtifactViewBeacon(fixture);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    // The path-only form is fine here — apiClient.post prepends the API
    // base URL itself, so this still resolves to api.hired.video.
    expect(apiClient.post).toHaveBeenCalledWith(BEACON_PATH, fixture);
  });

  it("falls back to apiClient.post when navigator.sendBeacon returns false", async () => {
    (navigator as any).sendBeacon = vi.fn(() => false);

    await sendArtifactViewBeacon(fixture);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith(BEACON_PATH, fixture);
  });

  it("falls back to apiClient.post when navigator.sendBeacon throws", async () => {
    (navigator as any).sendBeacon = vi.fn(() => {
      throw new Error("queue full");
    });

    await sendArtifactViewBeacon(fixture);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith(BEACON_PATH, fixture);
  });
});
