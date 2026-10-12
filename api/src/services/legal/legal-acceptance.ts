/**
 * Legal-acceptance use cases shared across routes (creator program-terms
 * gate, legal status). Owns the "accepted the CURRENT version" rule so it
 * lives in one place; data access goes through LegalRepository.
 */
import { LegalRepository, type DbLike } from "../../repositories/legalRepository.js";

/**
 * Returns the subset of `kinds` whose current published version (in
 * `locale`) the user has accepted. Two queries total regardless of how
 * many kinds are checked. A kind is absent when no current doc exists,
 * the user never accepted it, or they accepted an older version.
 */
export async function findAcceptedCurrentLegalDocKinds(
  db: DbLike,
  userId: string,
  kinds: readonly string[],
  locale = "en",
): Promise<Set<string>> {
  const unique = Array.from(new Set(kinds));
  if (unique.length === 0) return new Set();
  const legal = new LegalRepository(db);
  const [docs, latestByKind] = await Promise.all([
    legal.findCurrentDocs(locale, unique),
    legal.findLatestAcceptancesByKind(userId, unique),
  ]);
  const accepted = new Set<string>();
  for (const doc of docs) {
    const latest = latestByKind.get(doc.kind);
    if (latest && latest.version === doc.version) accepted.add(doc.kind);
  }
  return accepted;
}
