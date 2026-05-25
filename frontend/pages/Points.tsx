/**
 * `/points` route. Thin wrapper around `<PointsHub />` — the same hub
 * is mounted on `/settings?tab=points` so the canonical "cash out + see
 * badges" experience lives in one place.
 */

import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { PointsHub } from "@/components/points/PointsHub";

export default function PointsPage() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <PointsHub />
    </div>
  );
}
