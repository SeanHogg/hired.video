/**
 * ATS-compatible output package use cases: persist a generated package and
 * serve its public landing data (counting the view). SQL lives in
 * repositories/studioAtsPackagesRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  incrementActiveAtsPackageViewBySlug,
  insertAtsPackage,
  type AtsPackageInsert,
  type AtsPackageRow,
} from "../../repositories/studioAtsPackagesRepository.js";

export function saveAtsPackage(values: AtsPackageInsert): Promise<AtsPackageRow> {
  return insertAtsPackage(getDb(), values);
}

/** The active package behind `slug` (404 otherwise), with this view counted
 *  in ONE statement (UPDATE … RETURNING). The returned `viewCount` already
 *  includes the view. `bump` is injectable for tests. */
export async function viewAtsPackage(
  slug: string,
  bump: (slug: string) => Promise<AtsPackageRow | null> = (s) => incrementActiveAtsPackageViewBySlug(getDb(), s),
): Promise<AtsPackageRow> {
  const pkg = await bump(slug);
  if (!pkg) throw new DomainError(404, "NOT_FOUND", "Package not found");
  return pkg;
}
