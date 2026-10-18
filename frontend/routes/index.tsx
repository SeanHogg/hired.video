// The app route table, composed from per-area blocks. Each block is a
// fragment of <Route> elements (react-router flattens fragments), and the
// blocks are concatenated here in the ORIGINAL table order.
import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { GlobalVerificationGate, PageLoader } from "@/components/routing/RouteGuards";
import { coreRoutes } from "./core-routes";
import { jobsPeopleRoutes } from "./jobs-people-routes";
import { toolsRoutes } from "./tools-routes";
import { servicesRoutes } from "./services-routes";
import { adminRoutes } from "./admin-routes";
import { publicInfoRoutes } from "./public-info-routes";

// Other pages (lazy loaded)
const NotFound = lazy(() => import("@/pages/NotFound"));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <GlobalVerificationGate>
      <Routes>
        {coreRoutes}
        {jobsPeopleRoutes}
        {toolsRoutes}
        {servicesRoutes}
        {adminRoutes}

        {publicInfoRoutes}

        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </GlobalVerificationGate>

    </Suspense>
  );
}
