/**
 * Pure helpers behind the notifications SSE poller: SSE block parsing, the
 * `since` poll cursor, and the tab-visible re-poll debounce.
 */
import { describe, it, expect } from "vitest";
import { newerIso, notificationsHubPath, parseSseBlock, visibleRepollDelay } from "../notification-sse";

describe("parseSseBlock", () => {
  it("parses an event + JSON data block", () => {
    const block = 'event: notification\ndata: {"id":"9b1f6a52-3c1e-4c2f-9a54-0d7f3c2b1e11","type":"badge"}';
    expect(parseSseBlock(block)).toEqual({
      event: "notification",
      data: { id: "9b1f6a52-3c1e-4c2f-9a54-0d7f3c2b1e11", type: "badge" },
    });
  });

  it("defaults the event name and accepts `data:` without a space", () => {
    expect(parseSseBlock('data:{"unreadCount":3}')).toEqual({ event: "message", data: { unreadCount: 3 } });
  });

  it("skips blocks with no data or malformed JSON (error case)", () => {
    expect(parseSseBlock("event: connected")).toBeNull();
    expect(parseSseBlock("event: summary\ndata: {not json")).toBeNull();
  });
});

describe("newerIso", () => {
  it("advances to a newer timestamp and normalises to ISO", () => {
    expect(newerIso("2026-10-17T09:00:00.000Z", "2026-10-17T09:05:12.345Z")).toBe("2026-10-17T09:05:12.345Z");
    expect(newerIso(null, "2026-10-17T09:05:12+00:00")).toBe("2026-10-17T09:05:12.000Z");
  });

  it("never moves backwards or onto garbage (boundary)", () => {
    const cur = "2026-10-17T09:05:12.345Z";
    expect(newerIso(cur, "2026-10-17T08:00:00.000Z")).toBe(cur);
    expect(newerIso(cur, cur)).toBe(cur);
    expect(newerIso(cur, "not-a-date")).toBe(cur);
    expect(newerIso(cur, null)).toBe(cur);
  });
});

describe("notificationsHubPath", () => {
  it("is a full burst without a cursor, cursored otherwise", () => {
    expect(notificationsHubPath(null)).toBe("/api/hubs/notifications");
    expect(notificationsHubPath("2026-10-17T09:05:12.345Z")).toBe(
      "/api/hubs/notifications?since=2026-10-17T09%3A05%3A12.345Z",
    );
  });
});

describe("visibleRepollDelay", () => {
  it("re-polls at once when the last poll is old enough", () => {
    expect(visibleRepollDelay(1_000, 31_000, 30_000)).toBe(0);
    expect(visibleRepollDelay(0, 90_000, 30_000)).toBe(0);
  });

  it("waits out the rest of the gap after a recent poll (debounce)", () => {
    expect(visibleRepollDelay(10_000, 25_000, 30_000)).toBe(15_000);
  });
});
