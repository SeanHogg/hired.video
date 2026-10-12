/**
 * `/v/:videoId` and `/v/ats/:slug` → `/m/...` (ROADMAP #1218).
 * Canonical watch is `/m/:videoId`; this page is the SPA alias redirect.
 */
import { Navigate, useLocation } from "react-router-dom";
import { canonicalMediaPath } from "./legacy-public-video-path";

export default function LegacyPublicVideoRedirect() {
  const location = useLocation();
  const dest =
    canonicalMediaPath(location.pathname, location.search, location.hash) ?? "/";
  return <Navigate to={dest} replace />;
}
