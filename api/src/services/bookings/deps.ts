/**
 * Bookings service dependency wiring. The default DI bundle for
 * production code; tests construct their own bundle and pass it
 * into BookingsService directly.
 */

import { getDb } from "../../db/index.js";
import { BookingsRepository } from "../../repositories/bookingsRepository.js";
import type { BookingsServiceDeps } from "./BookingsService.js";

export function defaultBookingsServiceDeps(): BookingsServiceDeps {
  const db = getDb();
  return {
    repo: new BookingsRepository(db),
    now: () => new Date(),
    randomBytes: (n: number) => {
      const a = new Uint8Array(n);
      // Workers and modern Node expose crypto.getRandomValues.
      // The legacy `crypto.randomBytes` is intentionally not used —
      // staying on the web-crypto path keeps the worker build trim.
      const g = (globalThis as { crypto?: Crypto }).crypto;
      if (!g || typeof g.getRandomValues !== "function") {
        throw new Error("crypto.getRandomValues is unavailable in this runtime");
      }
      g.getRandomValues(a);
      return a;
    },
  };
}
