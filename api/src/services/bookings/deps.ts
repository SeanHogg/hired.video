/**
 * Bookings service dependency wiring. The default DI bundle for
 * production code; tests construct their own bundle and pass it
 * into BookingsService directly.
 */

import { getDb } from "../../db/index.js";
import { BookingsRepository } from "../../repositories/bookingsRepository.js";
import type { BookingsServiceDeps } from "./BookingsService.js";
import { randomBytes } from "../../utils/crypto.js";

export function defaultBookingsServiceDeps(): BookingsServiceDeps {
  const db = getDb();
  return {
    repo: new BookingsRepository(db),
    now: () => new Date(),
    randomBytes,
  };
}
