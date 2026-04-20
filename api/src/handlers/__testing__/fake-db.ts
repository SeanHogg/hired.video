/**
 * Fake DB for handler integration tests — with real WHERE predicate
 * evaluation.
 *
 * The first cut of this shim (one copy per test file) ignored the WHERE
 * clause entirely. `.where(_: unknown) { return { limit(n) { return rows.slice(0, n); } } }`.
 * That let tests pass even when the production SQL would have returned a
 * different row, mutated the wrong records, or (worst) leaked another
 * user's data. The 2026-04-20 review called this out as the top test
 * brittleness issue, and it is — the fake was a lie.
 *
 * This module introspects Drizzle's SQL AST just enough to evaluate the
 * operators our handlers use:
 *   • eq(col, val)         — strict equality
 *   • ne(col, val)         — strict inequality
 *   • lte(col, val)        — <=
 *   • gte(col, val)        — >=
 *   • inArray(col, vals)   — vals.includes(row[col])
 *   • isNull(col), isNotNull(col)
 *   • and(...preds), or(...preds) — recursive
 *
 * Anything else falls through to a "match all rows" warning so test
 * authors see when they've hit the edge of the evaluator and can extend
 * it rather than silently get wrong answers.
 *
 * Usage:
 *   const { db, state, calls } = buildFakeDb({
 *     resume_information: [...],
 *     watched_resumes: [...],
 *   });
 *   // Pass `db` into handlers. state[table] mirrors the in-memory rows.
 *   // calls[] records every insert/update/delete for assertions.
 *
 * This is test infrastructure. The production db is a real Neon/Postgres
 * client via drizzle; that one executes SQL for real. Don't import this
 * from src/routes/* or src/services/*.
 */

// ---------------------------------------------------------------------------
// AST introspection — walks Drizzle's SQL objects to extract predicates
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

/** Drizzle column refs have a `.name` field (the DB column name) and a
 *  `.table` ref. We use `.name` as the row key — schema column aliases
 *  that differ from the key name would need a per-table mapping (our
 *  tables don't currently). */
function isColumn(x: unknown): x is { name: string; table: unknown } {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as any).name === "string" &&
    "table" in (x as any)
  );
}

function isParam(x: unknown): x is { value: unknown } {
  return (
    typeof x === "object" &&
    x !== null &&
    x.constructor?.name === "Param" &&
    "value" in (x as any)
  );
}

function isStringChunk(x: unknown): x is { value: string[] } {
  return (
    typeof x === "object" &&
    x !== null &&
    x.constructor?.name === "StringChunk"
  );
}

function chunkText(x: unknown): string {
  if (isStringChunk(x)) return x.value.join("");
  if (typeof x === "string") return x;
  return "";
}

function isSQL(x: unknown): x is { queryChunks: unknown[] } {
  return (
    typeof x === "object" &&
    x !== null &&
    Array.isArray((x as any).queryChunks)
  );
}

/** Compile a Drizzle SQL/condition into a row → boolean predicate.
 *  Unknown operator shapes fall through to always-true + a console warn
 *  so the test author notices. */
export function compilePredicate(cond: unknown): Predicate {
  if (cond == null) return () => true;
  if (!isSQL(cond)) return () => true;

  const chunks = cond.queryChunks;
  const joined = chunks.map(chunkText).join("");

  // ---- and(...) / or(...) wrappers look like `(… and …)` / `(… or …)` ----
  // Drizzle emits: [StringChunk('('), SQL{nested}, StringChunk(')')] where
  // the nested SQL has ' and '/' or ' stitching child predicates.
  if (chunks.length === 3 && joined === "(" + chunkText(chunks[1]) + ")" && isSQL(chunks[1])) {
    return compilePredicate(chunks[1]);
  }

  // Split nested SQL at top-level ' and '/' or ' operators. The nested
  // SQL for `and(a, b, c)` has chunks like: [SQL(a), StringChunk(' and '), SQL(b), StringChunk(' and '), SQL(c)].
  const operands: unknown[] = [];
  const operators: string[] = [];
  for (const chunk of chunks) {
    const text = chunkText(chunk).trim();
    if (text === "and" || text === "or") {
      operators.push(text);
    } else if (isSQL(chunk)) {
      operands.push(chunk);
    }
  }
  if (operators.length > 0 && operands.length === operators.length + 1) {
    const preds = operands.map(compilePredicate);
    if (operators.every((op) => op === "and")) {
      return (row) => preds.every((p) => p(row));
    }
    if (operators.every((op) => op === "or")) {
      return (row) => preds.some((p) => p(row));
    }
    // Mixed — drizzle always parenthesises, so this shouldn't happen, but
    // be defensive: treat as conjunction.
    return (row) => preds.every((p) => p(row));
  }

  // ---- Binary operators: [_, Column, ' OP ', Param, _] or with "in (..."
  const column = chunks.find(isColumn);
  const param = chunks.find(isParam);
  const opToken = chunks
    .map(chunkText)
    .find((t) => {
      const s = t.trim();
      return (
        s === "=" ||
        s === "<>" ||
        s === "!=" ||
        s === "<=" ||
        s === ">=" ||
        s === "<" ||
        s === ">" ||
        s === "in" ||
        s === "is null" ||
        s === "is not null"
      );
    });

  if (column) {
    const colName = column.name;

    // Unary: is null / is not null
    if (opToken?.trim() === "is null") {
      return (row) => row[colName] == null;
    }
    if (opToken?.trim() === "is not null") {
      return (row) => row[colName] != null;
    }

    if (param) {
      const val = param.value;

      // inArray ships the value as an array and the operator text is "in".
      if (joined.includes(" in (") || opToken?.trim() === "in") {
        const list = Array.isArray(val) ? val : [val];
        return (row) => list.some((v) => eqValue(row[colName], v));
      }

      switch (opToken?.trim()) {
        case "=":
          return (row) => eqValue(row[colName], val);
        case "<>":
        case "!=":
          return (row) => !eqValue(row[colName], val);
        case "<=":
          return (row) => (row[colName] as any) <= (val as any);
        case ">=":
          return (row) => (row[colName] as any) >= (val as any);
        case "<":
          return (row) => (row[colName] as any) < (val as any);
        case ">":
          return (row) => (row[colName] as any) > (val as any);
      }
    }
  }

  // Fell through — SQL expression we don't understand yet. Warn loudly so
  // tests that hit new operators extend this evaluator instead of silently
  // seeing "match all rows".
  // eslint-disable-next-line no-console
  console.warn(
    "[fake-db] unrecognised predicate — defaulting to match-all. chunks:",
    chunks.map((c) => (isSQL(c) ? "SQL{...}" : chunkText(c) || c?.constructor?.name)),
  );
  return () => true;
}

function eqValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date) return a.getTime() === new Date(b as any).getTime();
  if (b instanceof Date) return new Date(a as any).getTime() === b.getTime();
  return a === b;
}

// ---------------------------------------------------------------------------
// Table identification — match Drizzle tables by their `_.name` symbol
// ---------------------------------------------------------------------------

export function tableName(table: unknown): string | null {
  if (!table || typeof table !== "object") return null;
  const sym = Object.getOwnPropertySymbols(table).find((s) =>
    /name/i.test(s.description ?? ""),
  );
  const name = sym ? (table as any)[sym] : null;
  if (typeof name === "string") return name;
  const underscore = (table as any)._;
  return underscore?.name ?? underscore?.baseName ?? null;
}

// ---------------------------------------------------------------------------
// Fake DB builder
// ---------------------------------------------------------------------------

export interface FakeDbHandle {
  /** Drizzle-shaped client. Pass into handler `deps.db`. */
  db: any;
  /** Live references to the in-memory row arrays. Mutate freely in tests
   *  (push to seed, read to assert). */
  state: Record<string, Row[]>;
  /** Audit log of every insert/update/delete the handlers performed. */
  calls: Array<{ kind: string; table: string; values?: unknown; set?: unknown }>;
}

/** Build a fake Drizzle-compatible client backed by in-memory arrays.
 *  Tables are registered by their DB name (e.g. "resume_information").
 *  A table not seeded is auto-created empty on first access. */
export function buildFakeDb(seed: Record<string, Row[]> = {}): FakeDbHandle {
  const state: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) state[k] = v.slice();
  const calls: FakeDbHandle["calls"] = [];

  function tableRows(table: unknown): Row[] {
    const name = tableName(table);
    if (!name) throw new Error("[fake-db] could not identify table");
    if (!(name in state)) state[name] = [];
    return state[name];
  }

  function applySelect(rows: Row[], columns: unknown): Row[] {
    // select() with no column object → return full rows.
    if (!columns || typeof columns !== "object") return rows.slice();
    // select({ aliasA: col, aliasB: col }) → project each row to { aliasA: row[colName] }.
    const aliasMap: Array<[string, string]> = [];
    for (const [alias, ref] of Object.entries(columns as Record<string, unknown>)) {
      if (isColumn(ref)) aliasMap.push([alias, ref.name]);
    }
    if (aliasMap.length === 0) return rows.slice();
    return rows.map((row) => {
      const projected: Row = {};
      for (const [alias, colName] of aliasMap) projected[alias] = row[colName];
      return projected;
    });
  }

  function buildOrderKey(rows: Row[], ob: unknown): Row[] {
    // We don't implement actual ordering — just return stable order.
    // Tests that care about order should seed in the expected order.
    void ob;
    return rows;
  }

  function buildCount(rows: Row[], groupBy: unknown): Row[] {
    // Simplified count-by: find the grouping column from the orig select
    // stashed on the chain, aggregate into [{ [groupCol]: ..., c: N }].
    // The only count query we use is `count(*)::int` aliased to `c`.
    // For `.select({ c: count }).from(t)` (no groupBy), return [{ c: N }].
    if (!groupBy) return [{ c: rows.length }];
    if (isColumn(groupBy)) {
      const col = groupBy.name;
      const counts = new Map<unknown, number>();
      for (const r of rows) counts.set(r[col], (counts.get(r[col]) ?? 0) + 1);
      return Array.from(counts.entries()).map(([k, v]) => ({
        [col]: k,
        c: v,
      }));
    }
    return [{ c: rows.length }];
  }

  const db: any = {
    select(columns?: unknown) {
      return {
        from(table: unknown) {
          const rows = tableRows(table);
          let filtered = rows;
          let projected = applySelect(filtered, columns);
          let limited: Row[] | null = null;
          let ordered = false;
          let cond: Predicate | null = null;

          const resolve = () => {
            let out = filtered;
            if (cond) out = out.filter(cond);
            out = applySelect(out, columns);
            if (limited != null) out = out.slice(0, limited as unknown as number);
            return out;
          };

          // Aggregate-shape selects: when the caller did `.select({ c: count }).from().where().then()`
          // we need to apply the WHERE, then produce a single count row.
          const thenFn = async (resolveFn: (x: unknown) => void) => {
            let out = filtered;
            if (cond) out = out.filter(cond);
            // If columns include an aggregate alias `c`, return count-shape.
            const colsObj = columns as Record<string, unknown> | undefined;
            if (colsObj && "c" in colsObj && !isColumn((colsObj as any).c)) {
              resolveFn([{ c: out.length }]);
              return;
            }
            if (colsObj && "n" in colsObj && !isColumn((colsObj as any).n)) {
              resolveFn([{ n: out.length }]);
              return;
            }
            resolveFn(applySelect(out, columns));
          };

          const whereBuilder = (c: unknown) => {
            cond = compilePredicate(c);
            return chain;
          };

          const chain: any = {
            where: whereBuilder,
            limit(n: number) {
              limited = n as any;
              return {
                offset(m: number) {
                  let out = filtered;
                  if (cond) out = out.filter(cond);
                  out = out.slice(m, m + n);
                  return Promise.resolve(applySelect(out, columns));
                },
                then(resolveFn: any) {
                  resolveFn(resolve());
                },
              };
            },
            offset(m: number) {
              let out = filtered;
              if (cond) out = out.filter(cond);
              out = out.slice(m);
              return Promise.resolve(applySelect(out, columns));
            },
            orderBy(_ob: unknown) {
              ordered = true;
              void ordered;
              const orderedChain: any = Promise.resolve(resolve());
              orderedChain.limit = (n: number) => ({
                offset: (m: number) => {
                  const out = resolve().slice(m, m + n);
                  return Promise.resolve(out);
                },
                then(resolveFn: any) {
                  resolveFn(resolve().slice(0, n));
                },
              });
              return orderedChain;
            },
            groupBy(gb: unknown) {
              let out = filtered;
              if (cond) out = out.filter(cond);
              return Promise.resolve(buildCount(out, gb));
            },
            then(resolveFn: any) {
              return thenFn(resolveFn);
            },
          };

          // Direct `from().select().then()` without `.where()` — support by
          // exposing the same chain object.
          const fromChain: any = {
            where: whereBuilder,
            limit: chain.limit,
            offset: chain.offset,
            orderBy: chain.orderBy,
            groupBy: chain.groupBy,
            then(resolveFn: any) {
              return thenFn(resolveFn);
            },
          };
          return fromChain;

          // dead code ref below just to silence TS about unused helpers
          void projected;
          void buildOrderKey(rows, null);
        },
      };
    },
    insert(table: unknown) {
      const name = tableName(table)!;
      const rows = tableRows(table);
      return {
        values(v: any) {
          const incoming = Array.isArray(v) ? v : [v];
          const inserted: Row[] = [];
          for (const val of incoming) {
            const row: Row = {
              id: val.id ?? crypto.randomUUID(),
              ...val,
              createdAt: val.createdAt ?? new Date(),
              updatedAt: val.updatedAt ?? new Date(),
            };
            rows.push(row);
            inserted.push(row);
          }
          calls.push({ kind: "insert", table: name, values: incoming });
          return {
            returning(_cols?: unknown) {
              return Promise.resolve(inserted);
            },
            onConflictDoUpdate(_opts: unknown) {
              // Conflict handling isn't simulated — tests that need to
              // verify conflict behaviour should assert on calls[].
              return Promise.resolve();
            },
            onConflictDoNothing() {
              return Promise.resolve();
            },
            then(resolveFn: any) {
              resolveFn(inserted);
            },
          };
        },
      };
    },
    update(table: unknown) {
      const name = tableName(table)!;
      const rows = tableRows(table);
      return {
        set(values: Row) {
          return {
            where(c: unknown) {
              const pred = compilePredicate(c);
              const updated: Row[] = [];
              for (const row of rows) {
                if (!pred(row)) continue;
                Object.assign(row, values);
                updated.push(row);
              }
              calls.push({ kind: "update", table: name, set: values });
              return {
                returning(_cols?: unknown) {
                  return Promise.resolve(updated);
                },
                then(resolveFn: any) {
                  resolveFn(updated);
                },
              };
            },
          };
        },
      };
    },
    delete(table: unknown) {
      const name = tableName(table)!;
      const rows = tableRows(table);
      return {
        where(c: unknown) {
          const pred = compilePredicate(c);
          const kept = rows.filter((r) => !pred(r));
          rows.length = 0;
          for (const r of kept) rows.push(r);
          calls.push({ kind: "delete", table: name });
          return Promise.resolve();
        },
      };
    },
  };

  return { db, state, calls };
}
