// Shared formatters for the activities surfaces (worker MyActivities + employer
// Team page) so money + duration render identically on both (DRY).

export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents || 0) / 100);
  } catch {
    return `$${((cents || 0) / 100).toFixed(2)}`;
  }
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ss = s % 60;
  if (h > 0) return `${h}h ${mm}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}
