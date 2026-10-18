/**
 * Repository bundle bound to the live request DB handle — the non-admin
 * twin of `adminRepos()` (repositories/admin/index.ts). Routes and service
 * factories use this instead of calling `getDb()` themselves; tests keep
 * calling `buildRepos(fakeDb)` directly.
 */
import { getDb } from "../db/index.js";
import { buildRepos, type Repos } from "./index.js";

export function liveRepos(): Repos {
  return buildRepos(getDb());
}
