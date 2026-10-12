# Database Conventions

Single source of truth for schema-level decisions. Every new table / column
MUST follow these. Drift is a code-review block.

## Timestamps

```ts
createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
```

- ALWAYS `withTimezone: true`. Postgres stores `timestamptz` as UTC; the
  flag keeps the type info so client offsets don't silently drift.
- ALWAYS `.defaultNow()` (not `default(sql\`now()\`)`, not `default(new Date())`).
  The last one is a bug — it evaluates at module-load, not row-insert.
- `updatedAt` MUST be bumped by the writer or a trigger. Add the column
  only if you actually plan to keep it accurate.

## Primary keys

```ts
id: uuid("id").primaryKey().defaultRandom(),
```

- ALWAYS `uuid`. Never `serial` for new tables (the historical
  `countries.id serial` exists for compatibility with ISO numeric codes).
- ALWAYS `.defaultRandom()` so Drizzle's insert shape stays clean.

## Foreign keys

```ts
userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
```

- ALWAYS choose explicit `onDelete`. The default is `NO ACTION` which
  behaves like `RESTRICT` and silently blocks deletes.
- `cascade` for owned-by; `set null` for soft-link / audit-survives;
  `restrict` only when intentional immutability (legal docs, financial
  records that must outlive the actor).
- For self-referential FKs use the `AnyPgColumn` escape:
  ```ts
  parentId: uuid("parent_id").references((): AnyPgColumn => myTable.id, { onDelete: "set null" }),
  ```

## Polymorphic references

```ts
subjectType: varchar("subject_type", { length: 32 }).notNull(),
subjectId: uuid("subject_id").notNull(),
```

- Column names are `subject_type` + `subject_id` everywhere — NOT
  `entity_kind/id`, `target_type/id`, or `ref_type/id`. (Historical
  drift: `content_locations.entity_kind/id`, `tag_assignments.axis/entity_id`
  predate the rule; treat as exceptions, don't replicate.)
- ALWAYS add a CHECK constraint on `subject_type` enumerating allowed
  values, sourced from a `shared/` registry (see
  `shared/content-locations.ts`, `shared/reviews/subject-descriptors.ts`).
- ALWAYS add a composite index `(subject_type, subject_id, created_at DESC)`.

## Soft delete

```ts
archivedAt: timestamp("archived_at", { withTimezone: true }),
```

- Canonical column for "this row is hidden but kept." See
  `services/db/soft-delete.ts` for the `notArchived(col)` helper.
- Pre-existing `is_archived boolean` columns coexist during the
  transition (migration 0154 backfilled archived_at from is_archived).
  Reads MUST use the helper. New writes set both.
- `deleted_at timestamp` (on `users` only) is distinct semantically —
  soft-DELETE with retention vs. soft-ARCHIVE which just hides.

## Polymorphic ownership

For tables an entity can be owned by (user, company, delegated subject):

```ts
ownerType: varchar("owner_type", { length: 16 }).notNull(),
ownerId: uuid("owner_id").notNull(),
```

- Canonical pair routed through `canActFor()` at the service layer.
- Studio aggregate is the reference implementation. New tables MUST
  follow this; XOR-nullable pairs (#1610 CHECK) are the legacy shape.

## Money

```ts
amountCents: integer("amount_cents").notNull(),
currency: varchar("currency", { length: 8 }).default("USD").notNull(),
```

- ALWAYS cents as `integer` (or `bigint` if amounts can exceed $21M).
- NEVER `numeric` for money — variable width + slow comparison.
- `CHECK (amount_cents >= 0)` for accumulators; signed allowed for ledgers.

## Status / enum-like varchar

```ts
status: varchar("status", { length: 24 }).notNull().default("active"),
```

- Length matches the longest value + ~50% headroom. Don't blanket
  `varchar(50)` — measure.
- ALWAYS pair with a `CHECK` constraint enumerating valid values, sourced
  from a `shared/` enum so frontend + backend can't drift.

## Indexes

- One `created_at DESC` composite per "list my X newest first" query.
- One unique per "one row per (user, key)" relationship.
- Partial index (`WHERE col IS NOT NULL`) when ≥30% of rows have NULL.
- Never blanket-index every column. Run the EXPLAIN before adding.
- **Every index a migration creates MUST also be declared in the table's
  Drizzle callback under the SAME name.** CI runs `drizzle-kit push --force`
  before the SQL runner, and push DROPS any index on a schema table that the
  schema doesn't declare; the runner applies each file once, so the index is
  gone for good. Migration 0495 mirrored ~165 legacy migration-only indexes
  for this reason.
- Push diffs index name, column names, ASC/DESC, NULLS order, uniqueness and
  method (not WHERE / opclass / expressions). So: plain `DESC` in SQL ⇒
  `.desc().nullsFirst()` in Drizzle (Drizzle's bare `.desc()` means NULLS
  LAST and triggers a rebuild); never mix plain columns and expressions in one
  index (push introspects every column of an expression index as an
  expression, so a mixed index is dropped + rebuilt on every deploy) — use
  `sql` for every column, ascending.
- Never declare `.nullsNotDistinct()` on a `unique()`: drizzle-kit 0.31
  introspects every unique constraint as NULLS DISTINCT, so push re-creates it
  on every deploy and stops on a "truncate the table?" prompt CI cannot
  answer. Declare the plain unique and set NULLS NOT DISTINCT in a migration
  (see 0532). `schema-catalog.test.ts` enforces this.
- Declaring a UNIQUE index makes push create it before any migration runs; if
  duplicates exist the deploy aborts. Dedupe (or prove duplicates impossible)
  before declaring a unique index on an existing table.
- Extensions an index depends on (e.g. `pg_trgm` for `gin_trgm_ops`) must be
  created by `scripts/ensure-db-extensions.mjs`, which `npm run db:push` runs
  before drizzle-kit.

## High-volume append-only tables

Tables that will exceed 100M rows at 1M users:
- `tool_runs`, `ai_chat_messages`, `points_ledger`, `xapi_statements`,
  `artifact_views`, `request_logs`, `activity_logs`, `external_email_messages`,
  `extension_events`, `notifications`.

Strategy split:
- **Retention-swept** (services/maintenance/retention-sweep.ts caps growth):
  `tool_runs`, `ai_chat_messages`, `request_logs`, `activity_logs`,
  `extension_events`, `geocoder_cache`, `worker_runs`, `integration_runs`,
  `profile_sync_runs`. No partitioning needed if retention covers it.
- **Audit-required** (can't retention-sweep): `points_ledger`,
  `point_redemptions`, `usage_ledger`, `admin_audit_log`,
  `xapi_statements`. These MUST be partitioned by month once we cross
  a row-count threshold. Migration 0158 sets up the partitioning
  scaffolding for `points_ledger` + `xapi_statements`.
- **User-facing** (can't retention-sweep without losing data):
  `external_email_messages`, `notifications`, `artifact_views`. These
  need per-user retention windows + indexes that bound query work.

## Migration patterns

See `drizzle/TEMPLATE.md` for the canonical idempotent patterns +
the `pg_temp` ban.

## Lint enforcement

`scripts/lint-migrations.mjs` runs in CI before tests. Catches:
- `pg_temp.*` use
- `ALTER COLUMN TYPE` without an `information_schema.columns.data_type` gate
- `ADD CONSTRAINT` without a `pg_constraint.conname` gate
- `DROP COLUMN` / `DROP TABLE` without `IF EXISTS`

New migrations (≥ 0156) must pass strict; pre-#1625 are advisory only.
