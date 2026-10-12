/**
 * Autosave contract shared by the API and the editors (#2242).
 *
 * A save that carries the version it was based on (`baseRevision`) is
 * refused with HTTP 409 + this error code when the stored copy has moved on
 * — another tab or device saved in between. The editor then asks the user
 * which copy to keep instead of overwriting the newer one.
 */
export const STALE_REVISION_CODE = "STALE_REVISION";
