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

/** Drizzle column refs have a `.name` field (the **DB** column name, e.g.
 *  "user_id") and a `.table` ref. To evaluate predicates against the
 *  in-memory row state — which handlers populate with JS property names
 *  ("userId") via `db.insert(t).values({...})` — we reverse-look the JS
 *  property by walking the column's table. */
function isColumn(x: unknown): x is { name: string; table: unknown } {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as any).name === "string" &&
    "table" in (x as any)
  );
}

/** Cache the column → JS-prop-name reverse lookup. */
const columnToJsPropCache = new WeakMap<object, string>();

export function jsPropNameForColumn(column: { name: string; table: unknown }): string {
  const cached = columnToJsPropCache.get(column as object);
  if (cached) return cached;

  const table = column.table as Record<string, unknown> | null;
  if (table && typeof table === "object") {
    for (const [key, ref] of Object.entries(table)) {
      if (ref === column) {
        columnToJsPropCache.set(column as object, key);
        return key;
      }
    }
  }
  // Fallback: DB column name (rare — would only fire if table has no enumerable keys).
  return column.name;
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
    x.constructor?.name === "SQL" &&
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

  // ---- paren wrapper: [StringChunk("("), SQL{inner}, StringChunk(")")] ----
  if (
    chunks.length === 3 &&
    chunkText(chunks[0]) === "(" &&
    chunkText(chunks[2]) === ")" &&
    isSQL(chunks[1])
  ) {
    return compilePredicate(chunks[1]);
  }

  // ---- compound `SQL(a) StringChunk(' and ') SQL(b) ...` ----
  const operators: string[] = [];
  const operands: unknown[] = [];
  let looksCompound = false;
  for (const chunk of chunks) {
    const text = chunkText(chunk).trim();
    if (text === "and" || text === "or") {
      operators.push(text);
      looksCompound = true;
    } else if (isSQL(chunk)) {
      operands.push(chunk);
    }
  }
  if (looksCompound && operators.length > 0 && operands.length === operators.length + 1) {
    const preds = operands.map(compilePredicate);
    if (operators.every((op) => op === "and")) {
      return (row) => preds.every((p) => p(row));
    }
    if (operators.every((op) => op === "or")) {
      return (row) => preds.some((p) => p(row));
    }
    return (row) => preds.every((p) => p(row));
  }

  // ---- binary operators: [_, Column, StringChunk(' OP '), Param | Array, _]
  // ---- unary:           [_, Column, StringChunk(' is null' / ' is not null')]
  const column = chunks.find(isColumn);
  const opToken = chunks
    .map(chunkText)
    .map((t) => t.trim())
    .find(
      (t) =>
        t === "=" ||
        t === "<>" ||
        t === "!=" ||
        t === "<=" ||
        t === ">=" ||
        t === "<" ||
        t === ">" ||
        t === "in" ||
        t === "is null" ||
        t === "is not null",
    );

  if (column) {
    const jsProp = jsPropNameForColumn(column);

    if (opToken === "is null") return (row) => row[jsProp] == null;
    if (opToken === "is not null") return (row) => row[jsProp] != null;

    // inArray: RHS is a raw JS array of Param objects sitting in the chunks.
    if (opToken === "in") {
      const arrayChunk = chunks.find((c): c is unknown[] => Array.isArray(c));
      let list: unknown[] = [];
      if (Array.isArray(arrayChunk)) {
        list = arrayChunk.map((p) => (isParam(p) ? p.value : p));
      } else {
        // Some Drizzle shapes pass a single Param whose value is an array.
        const p = chunks.find(isParam);
        if (p && Array.isArray(p.value)) list = p.value;
      }
      return (row) => list.some((v) => eqValue(row[jsProp], v));
    }

    // Binary: find the rhs as a Param directly in the chunks.
    const param = chunks.find(isParam);
    if (param) {
      const val = param.value;
      switch (opToken) {
        case "=":
          return (row) => eqValue(row[jsProp], val);
        case "<>":
        case "!=":
          return (row) => !eqValue(row[jsProp], val);
        case "<=":
          return (row) => (row[jsProp] as any) <= (val as any);
        case ">=":
          return (row) => (row[jsProp] as any) >= (val as any);
        case "<":
          return (row) => (row[jsProp] as any) < (val as any);
        case ">":
          return (row) => (row[jsProp] as any) > (val as any);
      }
    }
  }

  // Fell through — SQL expression we don't understand yet. Warn loudly so
  // tests that hit new operators extend this evaluator instead of silently
  // seeing "match all rows".
  // eslint-disable-next-line no-console
  console.warn(
    "[fake-db] unrecognised predicate — defaulting to match-all. chunks:",
    chunks.map((c) => (isSQL(c) ? "SQL{...}" : chunkText(c) || (c as any)?.constructor?.name)),
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
    // select({ aliasA: col, aliasB: col }) → project each row to { aliasA: row[jsProp] }.
    const aliasMap: Array<[string, string]> = [];
    for (const [alias, ref] of Object.entries(columns as Record<string, unknown>)) {
      if (isColumn(ref)) aliasMap.push([alias, jsPropNameForColumn(ref)]);
    }
    if (aliasMap.length === 0) return rows.slice();
    return rows.map((row) => {
      const projected: Row = {};
      for (const [alias, jsProp] of aliasMap) projected[alias] = row[jsProp];
      return projected;
    });
  }

  function buildOrderKey(rows: Row[], ob: unknown): Row[] {
    // We don't implement actual ordering — just return stable order.
    // Tests that care about order should seed in the expected order.
    void ob;
    return rows;
  }

  function buildCount(rows: Row[], groupBy: unknown, columns: unknown): Row[] {
    if (!groupBy) return [{ c: rows.length }];
    if (isColumn(groupBy)) {
      const jsProp = jsPropNameForColumn(groupBy);
      // Use the alias from select() for the group column if available, else
      // the JS prop name. For count queries we want { resumeId, c } shape.
      let groupAlias = jsProp;
      if (columns && typeof columns === "object") {
        for (const [alias, ref] of Object.entries(columns as Record<string, unknown>)) {
          if (ref === groupBy) {
            groupAlias = alias;
            break;
          }
        }
      }
      const counts = new Map<unknown, number>();
      for (const r of rows) counts.set(r[jsProp], (counts.get(r[jsProp]) ?? 0) + 1);
      return Array.from(counts.entries()).map(([k, v]) => ({
        [groupAlias]: k,
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
              return Promise.resolve(buildCount(out, gb, columns));
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
            onConflictDoUpdate(opts: unknown) {
              // Simulate Postgres `INSERT ... ON CONFLICT (target) DO
              // UPDATE SET ...`. When a just-inserted row collides with
              // an EARLIER row on the target columns, pop the duplicate
              // from state, merge `opts.set` into the surviving row, and
              // report the surviving row via returning().
              //
              // Without this simulation a handler that caches on every
              // call (like saveMatchScore) looks like it leaks multiple
              // rows per (user, job, resume), which mis-represents the
              // prod behaviour the uniqueIndex guarantees.
              const o = (opts ?? {}) as { target?: unknown; set?: Row };
              const targetCols = Array.isArray(o.target) ? o.target : [];
              const targetKeys = targetCols
                .filter(isColumn)
                .map((c) => jsPropNameForColumn(c));

              if (targetKeys.length > 0) {
                const finalInserted: Row[] = [];
                for (const justInserted of inserted) {
                  // Find an earlier row (not the just-inserted one) with
                  // the same target values.
                  const conflict = rows.find(
                    (r) =>
                      r !== justInserted &&
                      targetKeys.every((k) => r[k] === justInserted[k]),
                  );
                  if (conflict) {
                    // Remove the just-inserted duplicate, merge set into
                    // the existing survivor.
                    const idx = rows.indexOf(justInserted);
                    if (idx >= 0) rows.splice(idx, 1);
                    Object.assign(conflict, o.set ?? {});
                    finalInserted.push(conflict);
                  } else {
                    // No conflict — the INSERT stands.
                    finalInserted.push(justInserted);
                  }
                }
                // Replace the `inserted` reference's contents so the
                // chained returning() reports the right rows.
                inserted.length = 0;
                inserted.push(...finalInserted);
              }
              return {
                returning(_cols?: unknown) {
                  return Promise.resolve(inserted);
                },
                then(resolveFn: any) {
                  resolveFn(inserted);
                },
              };
            },
            onConflictDoNothing() {
              // DO NOTHING drops any just-inserted duplicate (no merge).
              const surviving: Row[] = [];
              for (const justInserted of inserted) {
                const dupIdx = rows.findIndex(
                  (r) =>
                    r !== justInserted &&
                    r.id !== undefined &&
                    r.id === justInserted.id,
                );
                if (dupIdx >= 0) {
                  const selfIdx = rows.indexOf(justInserted);
                  if (selfIdx >= 0) rows.splice(selfIdx, 1);
                } else {
                  surviving.push(justInserted);
                }
              }
              inserted.length = 0;
              inserted.push(...surviving);
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
