import type { GrowthPoint } from "./types";

/** Pie slice palette for the account-type (users by role) chart. */
export const ROLE_PIE_COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

/** Pie slice palette for the revenue-by-tier chart. */
export const REVENUE_PIE_COLORS = ["#00C49F", "#0088FE", "#FFBB28", "#FF8042", "#8884D8"];

/** Line stroke per growth series. */
export const GROWTH_STROKES = {
  users: "#8884d8",
  jobs: "#82ca9d",
  companies: "#ffc658",
  resumes: "#ff7300",
} as const;

/** Formats the 90-day growth series' ISO dates into short axis labels. */
export function toGrowthChartData(items: GrowthPoint[] | undefined): GrowthPoint[] {
  return (items || []).map((item) => ({
    ...item,
    date: new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
}

/** Employer and recruiter accounts are treated as paid. */
export function isPaidRole(role: string): boolean {
  return role === "employer" || role === "recruiter";
}

/** "pro_plus" → "Pro Plus" tier label (first underscore only, each word capitalised). */
export function formatTierName(tier: string): string {
  return tier.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function payoutStatusClass(status: string): string {
  if (status === "Paid") return "text-green-600";
  if (status === "Processing") return "text-yellow-600";
  if (status === "Failed") return "text-red-600";
  return "text-muted-foreground";
}
