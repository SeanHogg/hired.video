/**
 * The offline save queue (lib/autosave/offline-save-queue.ts, #2242): autosave
 * writes that failed while offline wait here and are replayed on reconnect /
 * at app start. Driven through an in-memory store with the IndexedDB store's
 * contract (one entry per key, latest write wins).
 */
import { describe, expect, it, vi } from "vitest";
import {
  createOfflineSaveQueue,
  isOfflineFailure,
  type QueuedWrite,
  type QueueStore,
} from "@/lib/autosave/offline-save-queue";

function memoryStore(): QueueStore & { entries: Map<string, QueuedWrite> } {
  const entries = new Map<string, QueuedWrite>();
  return {
    entries,
    all: async () => [...entries.values()].map((e) => ({ ...e })),
    put: async (entry) => {
      entries.set(entry.key, { ...entry });
    },
    delete: async (key) => {
      entries.delete(key);
    },
  };
}

const RESUME_KEY = "resume:3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11";
const resumeWrite = (summary: string) => ({
  key: RESUME_KEY,
  method: "PUT" as const,
  path: "/api/resumes/3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11",
  body: { content: { basics: { name: "Sean Hogg", summary } } },
});

describe("offline save queue", () => {
  it("replays a queued write on flush and removes it once it reached the server", async () => {
    const store = memoryStore();
    const send = vi.fn(async (_w: QueuedWrite) => {});
    const queue = createOfflineSaveQueue(store, send, () => 1_000);
    await queue.enqueue(resumeWrite("typed on the train"));
    expect(await queue.flush()).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].body).toEqual(resumeWrite("typed on the train").body);
    expect(store.entries.size).toBe(0);
  });

  it("keeps one write per document — the latest", async () => {
    const store = memoryStore();
    const send = vi.fn(async (_w: QueuedWrite) => {});
    const queue = createOfflineSaveQueue(store, send, () => 1_000);
    await queue.enqueue(resumeWrite("v1"));
    await queue.enqueue(resumeWrite("v2"));
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0][0].body as { content: { basics: { summary: string } } }).content.basics.summary).toBe("v2");
  });

  it("leaves a write alone while a mounted editor claims its document", async () => {
    const store = memoryStore();
    const send = vi.fn(async (_w: QueuedWrite) => {});
    const queue = createOfflineSaveQueue(store, send, () => 1_000);
    await queue.enqueue(resumeWrite("v1"));
    const release = queue.claim(RESUME_KEY);
    expect(await queue.flush()).toBe(0);
    expect(send).not.toHaveBeenCalled();
    release();
    expect(await queue.flush()).toBe(1);
  });

  it("keeps a write whose replay failed and counts the attempt", async () => {
    const store = memoryStore();
    const send = vi.fn(async (_w: QueuedWrite) => {
      throw new TypeError("Failed to fetch");
    });
    const queue = createOfflineSaveQueue(store, send, () => 1_000);
    await queue.enqueue(resumeWrite("v1"));
    expect(await queue.flush()).toBe(0);
    expect(store.entries.get(RESUME_KEY)?.attempts).toBe(1);
  });

  it("drops a write older than a week instead of replaying it over newer work", async () => {
    const store = memoryStore();
    const send = vi.fn(async (_w: QueuedWrite) => {});
    let now = 0;
    const queue = createOfflineSaveQueue(store, send, () => now);
    await queue.enqueue(resumeWrite("stale"));
    now = 8 * 24 * 60 * 60 * 1000;
    expect(await queue.flush()).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(store.entries.size).toBe(0);
  });

  it("drops a write after ten failed replays", async () => {
    const store = memoryStore();
    const send = vi.fn(async (_w: QueuedWrite) => {});
    const queue = createOfflineSaveQueue(store, send, () => 1_000);
    await store.put({ ...resumeWrite("poison"), queuedAt: 1_000, attempts: 10 });
    await queue.flush();
    expect(send).not.toHaveBeenCalled();
    expect(store.entries.size).toBe(0);
  });

  it("removes a write the editor saved itself", async () => {
    const store = memoryStore();
    const queue = createOfflineSaveQueue(store, vi.fn(async () => {}), () => 1_000);
    await queue.enqueue(resumeWrite("v1"));
    await queue.remove(RESUME_KEY);
    expect(store.entries.size).toBe(0);
  });
});

describe("isOfflineFailure", () => {
  it("is true for a request that never got a response", () => {
    expect(isOfflineFailure({ code: "NETWORK_ERROR" })).toBe(true);
  });

  it("is false when the server answered (even with a non-JSON 500)", () => {
    expect(isOfflineFailure({ code: "NETWORK_ERROR", context: { httpStatus: 500 } })).toBe(false);
    expect(isOfflineFailure({ code: "VALIDATION_ERROR" })).toBe(false);
  });
});
