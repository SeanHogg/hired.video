/**
 * Erase a user's rows from archived tables (GDPR erasure): the `archive`
 * schema plus the few `public.*_archived` tables.
 *
 * Driven entirely by ARCHIVE_PII_REGISTRY — one loop, no per-table code.
 * A table, parent table or column that does not exist in this database
 * (a migration has not run here yet, or a column never existed) is skipped,
 * so erasure never fails on environment drift. Each table's DELETE is
 * isolated: a failure is logged and reported, and the remaining tables are
 * still purged.
 */
import { sql, type SQL } from "drizzle-orm";
import { getDb, type Db } from "../../db/index.js";
import { quoteIdent, quoteQualified } from "../../db/sql-ident.js";
import { logger } from "../../lib/logger.js";
import { ARCHIVE_PII_REGISTRY, type ArchivePiiEntry } from "./archive-pii-registry.js";

/** Who is being erased. `email` is the address the user had BEFORE
 *  anonymization (read it first); null/empty skips the email links. */
export interface ArchiveErasureSubject {
  userId: string;
  email?: string | null;
}

export interface ArchiveErasureResult {
  /** "schema.table" → rows deleted (tables skipped for drift are absent). */
  deleted: Record<string, number>;
  /** tables skipped because the table or every link column is missing. */
  skipped: string[];
  /** tables whose DELETE threw (logged). */
  failed: string[];
}

/** "schema.table" → set of existing column names. */
type ColumnCatalog = Map<string, Set<string>>;

const key = (schemaName: string, table: string) => `${schemaName}.${table}`;
const schemaOf = (e: ArchivePiiEntry) => e.schema ?? "archive";
const col = (name: string) => sql.raw(quoteIdent(name));

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

/** Every relation the registry touches, so one catalog query answers
 *  "does this table/column exist here" for the whole loop. */
function referencedRelations(registry: readonly ArchivePiiEntry[]): Array<[string, string]> {
  const seen = new Map<string, [string, string]>();
  for (const e of registry) {
    seen.set(key(schemaOf(e), e.table), [schemaOf(e), e.table]);
    for (const v of e.via ?? []) seen.set(key(v.parentSchema, v.parentTable), [v.parentSchema, v.parentTable]);
  }
  return [...seen.values()];
}

async function loadColumnCatalog(db: Db, relations: Array<[string, string]>): Promise<ColumnCatalog> {
  const pairs = sql.join(relations.map(([s, t]) => sql`(${s}::text, ${t}::text)`), sql`, `);
  const result = await db.execute(sql`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE (table_schema::text, table_name::text) IN (${pairs})
  `);
  const catalog: ColumnCatalog = new Map();
  for (const r of rowsOf<{ table_schema: string; table_name: string; column_name: string }>(result)) {
    const k = key(r.table_schema, r.table_name);
    if (!catalog.has(k)) catalog.set(k, new Set());
    catalog.get(k)!.add(r.column_name);
  }
  return catalog;
}

/** The DELETE for one entry, using only links that exist in `catalog`;
 *  null when the table or every link is absent. Exported for tests. */
export function buildArchiveDeleteSql(entry: ArchivePiiEntry, subject: ArchiveErasureSubject, catalog: ColumnCatalog): SQL | null {
  const own = catalog.get(key(schemaOf(entry), entry.table));
  if (!own) return null;
  const { userId } = subject;
  const email = subject.email?.trim() || null;
  const clauses: SQL[] = [];
  for (const c of entry.userColumns) {
    if (own.has(c)) clauses.push(sql`${col(c)}::text = ${userId}`);
  }
  if (email) {
    for (const c of entry.emailColumns ?? []) {
      if (own.has(c)) clauses.push(sql`lower(${col(c)}) = lower(${email})`);
    }
  }
  for (const v of entry.via ?? []) {
    const parent = catalog.get(key(v.parentSchema, v.parentTable));
    const parentCols = v.parentUserColumns.filter((c) => parent?.has(c));
    if (!own.has(v.column) || !parent?.has(v.parentKey) || parentCols.length === 0) continue;
    const parentMatch = sql.join(parentCols.map((c) => sql`${col(c)}::text = ${userId}`), sql` OR `);
    clauses.push(sql`${col(v.column)} IN (SELECT ${col(v.parentKey)} FROM ${sql.raw(quoteQualified(v.parentSchema, v.parentTable))} WHERE ${parentMatch})`);
  }
  if (clauses.length === 0) return null;
  return sql`DELETE FROM ${sql.raw(quoteQualified(schemaOf(entry), entry.table))} WHERE ${sql.join(clauses, sql` OR `)}`;
}

export async function eraseArchivedUserData(
  subject: ArchiveErasureSubject,
  db: Db = getDb(),
  registry: readonly ArchivePiiEntry[] = ARCHIVE_PII_REGISTRY,
): Promise<ArchiveErasureResult> {
  const out: ArchiveErasureResult = { deleted: {}, skipped: [], failed: [] };
  const catalog = await loadColumnCatalog(db, referencedRelations(registry));
  for (const entry of registry) {
    const name = key(schemaOf(entry), entry.table);
    const stmt = buildArchiveDeleteSql(entry, subject, catalog);
    if (!stmt) { out.skipped.push(name); continue; }
    try {
      const result = await db.execute(stmt);
      out.deleted[name] = Number((result as { rowCount?: number }).rowCount ?? 0);
    } catch (err) {
      out.failed.push(name);
      logger.error("archive erasure failed", { table: name, userId: subject.userId, error: err });
    }
  }
  return out;
}
