/**
 * LegacyRedirect — renders one row of the legacy-redirect table
 * (lib/routing/legacy-redirects.ts): a `<Navigate replace>` to the row's
 * destination, built from the matched route params. A hiring-only row goes
 * through HiringRouteGate first, so it self-gates the way the page it
 * replaced did.
 */
import { Navigate, useParams } from "react-router-dom";
import type { LegacyRedirect as LegacyRedirectRow } from "@/lib/routing/legacy-redirects";
import { HiringRouteGate } from "./HiringRouteGate";

export default function LegacyRedirect({ row }: { row: LegacyRedirectRow }) {
  const params = useParams();
  const target = <Navigate to={row.to(params)} replace />;
  return row.hiringOnly ? <HiringRouteGate>{target}</HiringRouteGate> : target;
}
