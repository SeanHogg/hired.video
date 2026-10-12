/**
 * Barrel for the reusable analytics panel. Every per-artifact dashboard
 * (video, resume, article, …) imports from here so adding a new
 * artifact type doesn't require hunting through component sub-paths.
 */

export { default as MetricsPanel } from "./MetricsPanel";
export { default as ArtifactAnalyticsDashboard } from "./ArtifactAnalyticsDashboard";
export { default as GeoHotspotMap } from "./GeoHotspotMap";
export { default as EngagementHeatmap } from "./EngagementHeatmap";
export { default as ReferrerBreakdown } from "./ReferrerBreakdown";
export { default as StatCard } from "./StatCard";
export { default as ViewerList } from "./ViewerList";
