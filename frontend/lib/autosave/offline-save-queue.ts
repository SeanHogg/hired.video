/**
 * offline-save-queue — autosave writes that couldn't reach the server, kept in
 * IndexedDB until they can (#2242).
 *
 * An editor's autosave (useServerAutosave) enqueues its write when the save
 * fails while the browser is offline, and removes it once a save succeeds.
 * The queue is keyed per document (latest write wins), so it holds at most
 * one write per open document. It is flushed:
 *   - by the editor itself, which retries with backoff and immediately on
 *     `online` while it is mounted (it "claims" its key so the global flush
 *     never sends the same write twice), and
 *   - globally on `online` and at app start (installOfflineSaveQueue, called
 *     once from the app root) for documents whose editor is no longer open —
 *     e.g. the tab was closed while offline.
 *
 * A write is a plain, serializable API request; it is replayed through the
 * typed api client. Entries older than MAX_AGE_MS are dropped rather than
 * replayed over newer work, and an entry is dropped after MAX_ATTEMPTS
 * failed replays.
 */
import { apiClient } from "@/lib/api-client";

export type QueuedWriteMethod = "POST" | "PUT" | "PATCH";

export interface QueuedWrite {
  /** One document = one key, e.g. `resume:<id>`. */
  key: string;
  method: QueuedWriteMethod;
  path: string;
  body: unknown;
  queuedAt: number;
  attempts: number;
}

export interface QueueStore {
  all(): Promise<QueuedWrite[]>;
  put(entry: QueuedWrite): Promise<void>;
  delete(key: string): Promise<void>;
}

export type SendWrite = (write: QueuedWrite) => Promise<void>;

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export interface OfflineSaveQueue {
  enqueue(write: Omit<QueuedWrite, "queuedAt" | "attempts">): Promise<void>;
  remove(key: string): Promise<void>;
  /** A mounted editor owns this key: the global flush leaves it alone. */
  claim(key: string): () => void;
  /** Replay every unclaimed write; returns how many reached the server. */
  flush(): Promise<number>;
}

export function createOfflineSaveQueue(
  store: QueueStore,
  send: SendWrite,
  now: () => number = Date.now,
): OfflineSaveQueue {
  const claimed = new Map<string, number>();
  let flushing: Promise<number> | null = null;

  const flushOnce = async (): Promise<number> => {
    let sent = 0;
    for (const write of await store.all()) {
      if (claimed.has(write.key)) continue;
      if (now() - write.queuedAt > MAX_AGE_MS || write.attempts >= MAX_ATTEMPTS) {
        await store.delete(write.key);
        continue;
      }
      let delivered = false;
      try {
        await send(write);
        delivered = true;
        sent += 1;
      } catch {
        /* counted below; retried on the next flush */
      }
      // A newer write that replaced this one while it was in flight is kept
      // untouched either way.
      const current = (await store.all()).find((w) => w.key === write.key);
      if (current?.queuedAt !== write.queuedAt) continue;
      if (delivered) await store.delete(write.key);
      else await store.put({ ...write, attempts: write.attempts + 1 });
    }
    return sent;
  };

  return {
    async enqueue(write) {
      await store.put({ ...write, queuedAt: now(), attempts: 0 });
    },
    remove: (key) => store.delete(key),
    claim(key) {
      claimed.set(key, (claimed.get(key) ?? 0) + 1);
      return () => {
        const n = (claimed.get(key) ?? 1) - 1;
        if (n <= 0) claimed.delete(key);
        else claimed.set(key, n);
      };
    },
    flush() {
      // One flush at a time: `online` and app start can fire together.
      if (!flushing) flushing = flushOnce().finally(() => (flushing = null));
      return flushing;
    },
  };
}

// ── IndexedDB store (self-gated: a no-op where IndexedDB is unavailable) ────

const DB_NAME = "hired-autosave";
const STORE = "pendingWrites";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      resolve(null);
      return;
    }
    try {
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(STORE, mode);
          const req = op(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req ? req.result : undefined);
          tx.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const indexedDbQueueStore: QueueStore = {
  all: async () => ((await run<QueuedWrite[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedWrite[]>)) ?? []),
  put: async (entry) => {
    await run("readwrite", (s) => {
      s.put(entry);
    });
  },
  delete: async (key) => {
    await run("readwrite", (s) => {
      s.delete(key);
    });
  },
};

const sendThroughApi: SendWrite = async (write) => {
  await apiClient.request(write.path, { method: write.method, body: write.body, suppressErrorEvent: true });
};

/** The app's queue. */
export const offlineSaveQueue = createOfflineSaveQueue(indexedDbQueueStore, sendThroughApi);

let installed = false;

/** Flush at app start and whenever the browser comes back online. Idempotent. */
export function installOfflineSaveQueue(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const flush = () => {
    if (navigator.onLine) void offlineSaveQueue.flush();
  };
  window.addEventListener("online", flush);
  flush();
}

/** True when a failed write is worth queueing: the browser says it's offline,
 *  or the request never got a response. */
export function isOfflineFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // A NetworkError that carries an HTTP status got a (non-JSON) response —
  // the server is reachable, so that is not an offline failure.
  const e = (err as { code?: unknown; context?: { httpStatus?: unknown } } | null) ?? null;
  return e?.code === "NETWORK_ERROR" && e.context?.httpStatus === undefined;
}
