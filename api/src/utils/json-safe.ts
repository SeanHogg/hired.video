/**
 * JSON-safe projection for edge-cached payloads.
 *
 * `getOrSetCached` round-trips L2 values through Workers KV as JSON, which
 * turns `Date` into ISO strings and drops `undefined` props. Caching a raw
 * Drizzle row would therefore lie about its type on a KV hit. Run the
 * loader's result through `toJsonSafe` so the cached value has the SAME
 * shape on a miss, an L1 hit and a KV hit — and the type says so.
 */

export type JsonSafe<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? JsonSafe<U>[]
    : T extends object
      ? { [K in keyof T]: JsonSafe<T[K]> }
      : T;

export function toJsonSafe<T>(value: T): JsonSafe<T> {
  if (value === undefined) return value as JsonSafe<T>;
  return JSON.parse(JSON.stringify(value)) as JsonSafe<T>;
}
