import type { PaginationOptions } from "../../utils/pagination.js";

/** `?pageNumber=&pageSize=` (default 20, max 50) for the feed list + search. */
export const FEED_PAGE_OPTS: PaginationOptions = {
  defaultLimit: 20,
  maxLimit: 50,
  limitKey: "pageSize",
  pageKey: "pageNumber",
};
