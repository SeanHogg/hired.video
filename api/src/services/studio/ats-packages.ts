/**
 * ATS-compatible output package use cases: persist a generated package and
 * serve its public landing data (counting the view). SQL lives in
 * repositories/studioAtsPackagesRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  findActiveAtsPackageBySlug,
  incrementAtsPackageViewCount,
  insertAtsPackage,
  type AtsPackageInsert,
  type AtsPackageRow,
} from "../../repositories/studioAtsPackagesRepository.js";

export function saveAtsPackage(values: AtsPackageInsert): Promise<AtsPackageRow> {
  return insertAtsPackage(getDb(), values);
}

/** The active package behind `slug` (404 otherwise), with this view counted.
 *  The returned `viewCount` already includes the view. */
export async function viewAtsPackage(slug: string): Promise<AtsPackageRow> {
  const db = getDb();
  const pkg = await findActiveAtsPackageBySlug(db, slug);
  if (!pkg) throw new DomainError(404, "NOT_FOUND", "Package not found");
  await incrementAtsPackageViewCount(db, pkg.id);
  return { ...pkg, viewCount: (pkg.viewCount ?? 0) + 1 };
}
