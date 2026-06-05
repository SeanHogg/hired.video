/**
 * Bookings domain services — single seam for every bookings consumer.
 *
 * - BookingsHostService          : host profile + KYC + Creator-program flip
 * - BookingsOfferingsService     : offering CRUD
 * - BookingsAvailabilityService  : recurring rules + overrides + CACHED slot grid
 * - BookingsReservationsService  : create / reschedule / cancel / status
 * - BookingsCommentsService      : threaded comments with author-kind gate
 *
 * Reference: docs/prd/bookings-and-reservations.md, gap #1648.
 */

export { BookingsService, BookingsServiceError } from "./BookingsService.js";
export type { BookingsServiceDeps } from "./BookingsService.js";
export { defaultBookingsServiceDeps } from "./deps.js";
