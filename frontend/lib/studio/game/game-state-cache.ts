/**
 * IndexedDB cache for the 3D world `GameState` (PWA / offline support,
 * part of gap #1636 PWA polish). Lets the editor:
 *   - Open instantly on next mount (no spinner waiting for the API).
 *   - Survive a flight without network.
 *   - Queue an offline save until the network comes back (set by the
 *     persistence layer when it sees a failed save — out of scope for
 *     this file; this is the storage primitive).
 *
 * Tiny `idb-keyval`-style wrapper around the native `indexedDB` API —
 * no library dep. One database, one object store, key = `projectId`,
 * value = `{ gameState, savedAt }`.
 *
 * Self-gated: every function returns `null` / no-op when `indexedDB`
 * isn't available (SSR, private browsing on some browsers, very old
 * runtimes). Callers don't need to guard.
 */

import type { GameState } from "@shared/game-state";

const DB_NAME = "hired-video-game-state";
const STORE = "gameStateByProject";
const DB_VERSION = 1;

interface CachedEntry {
  projectId: string;
  gameState: GameState;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      resolve(null);
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "projectId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // Quota exceeded / locked DB / private mode — fall back to no-op.
      resolve(null);
    };
  });
  return dbPromise;
}

/** Save the latest GameState for a project. Fire-and-forget. */
export async function saveCachedGameState(projectId: string, gameState: GameState): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const entry: CachedEntry = { projectId, gameState, savedAt: Date.now() };
    store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** Read the cached GameState for a project, if any. */
export async function loadCachedGameState(projectId: string): Promise<GameState | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<GameState | null>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(projectId);
    req.onsuccess = () => {
      const entry = req.result as CachedEntry | undefined;
      resolve(entry?.gameState ?? null);
    };
    req.onerror = () => resolve(null);
  });
}

/** Drop the cached entry — call after a confirmed-from-server load
 *  with `savedAt` newer than the cached row, or when a user explicitly
 *  resets. */
export async function clearCachedGameState(projectId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
