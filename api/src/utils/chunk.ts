/**
 * Split an array into consecutive slices of at most `size` items. Used to
 * keep multi-row INSERT/UPDATE statements under Postgres' 65,535 bind-param
 * ceiling (and neon-http request sizes) when batching per-row writes.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
