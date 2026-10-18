// SuperAdmin routes: consolidated admin groups (#2277), their legacy
// `/admin/*` redirects, and the direct-URL-only admin pages.
import { lazy, type ReactNode } from "react";
import { Route, Navigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminSection from "@/components/admin/AdminSection";
import { ADMIN_GROUPS, ADMIN_LEGACY_REDIRECTS } from "@/lib/admin-nav";

const SocialAccountsPage = lazy(() => import("@/pages/admin/SocialAccounts"));
const AdminPromotions = lazy(() => import("@/pages/admin/Promotions"));
const AdminCoupons = lazy(() => import("@/pages/admin/Coupons"));
const AdminTraffic = lazy(() => import("@/pages/admin/Traffic"));
const ProductDashboard = lazy(() => import("@/pages/admin/ProductDashboard"));
const FeedManagement = lazy(() => import("@/pages/admin/FeedManagement"));
const DashboardFeedCuration = lazy(() => import("@/pages/admin/DashboardFeedCuration"));
const RoleAccessManager = lazy(() => import("@/pages/admin/RoleAccessManager"));
const ActiveUsers = lazy(() => import("@/pages/admin/ActiveUsers"));
const CampaignManager = lazy(() => import("@/pages/admin/CampaignManager"));
const UserManagement = lazy(() => import("@/pages/admin/UserManagement"));
const CompanyManagement = lazy(() => import("@/pages/admin/CompanyManagement"));
const RolesPermissions = lazy(() => import("@/pages/admin/RolesPermissions"));
const JobsManagement = lazy(() => import("@/pages/admin/JobsManagement"));
const StudioManagement = lazy(() => import("@/pages/admin/StudioManagement"));
const StorageManagement = lazy(() => import("@/pages/admin/StorageManagement"));
const BillingManagement = lazy(() => import("@/pages/admin/BillingManagement"));
const ModuleManagement = lazy(() => import("@/pages/admin/ModuleManagement"));
const AuditLog = lazy(() => import("@/pages/admin/AuditLog"));
const Workers = lazy(() => import("@/pages/admin/Workers"));
const Security = lazy(() => import("@/pages/admin/Security"));
const ToolUsage = lazy(() => import("@/pages/admin/ToolUsage"));
const PageEmbeds = lazy(() => import("@/pages/admin/PageEmbeds"));
const ThemeCalendar = lazy(() => import("@/pages/admin/ThemeCalendar"));
const HelpMappings = lazy(() => import("@/pages/admin/HelpMappings"));
const ExtensionTelemetry = lazy(() => import("@/pages/admin/ExtensionTelemetry"));
const AIVendors = lazy(() => import("@/pages/admin/AIVendors"));
const SystemSettings = lazy(() => import("@/pages/admin/SystemSettings"));
const ModerationQueue = lazy(() => import("@/pages/admin/ModerationQueue"));
const AdminAccountAnalytics = lazy(() => import("@/pages/admin/AccountAnalytics"));
const AdminPartners = lazy(() => import("@/pages/admin/Partners"));
const AdminPoints = lazy(() => import("@/pages/admin/Points"));

// Consolidated admin groups → their `?view=` segment content (#2277). Keyed by
// AdminGroup.id then segment `view` ("" for single-view groups). Pages stay
// lazy; AdminSection mounts only the active node.
const ADMIN_SECTION_ELEMENTS: Record<string, Record<string, ReactNode>> = {
  dashboard: { "": <ProductDashboard /> },
  users: { registered: <UserManagement />, live: <ActiveUsers /> },
  companies: { "": <CompanyManagement /> },
  access: { roles: <RolesPermissions />, modules: <RoleAccessManager /> },
  feed: {
    notifications: <FeedManagement />,
    dashboard: <DashboardFeedCuration />,
    campaigns: <CampaignManager />,
  },
  studio: {
    content: <StudioManagement />,
    embeds: <PageEmbeds />,
    social: <SocialAccountsPage />,
    promotions: <AdminPromotions />,
    calendar: <ThemeCalendar />,
  },
  jobs: { "": <JobsManagement /> },
  insights: {
    traffic: <AdminTraffic />,
    accounts: <AdminAccountAnalytics />,
    tools: <ToolUsage />,
    extension: <ExtensionTelemetry />,
  },
  trust: {
    moderation: <ModerationQueue />,
    security: <Security />,
    audit: <AuditLog />,
  },
  billing: { "": <BillingManagement />, coupons: <AdminCoupons /> },
  modules: { "": <ModuleManagement /> },
  partners: { "": <AdminPartners /> },
  system: {
    settings: <SystemSettings />,
    storage: <StorageManagement />,
    workers: <Workers />,
    "ai-vendors": <AIVendors />,
  },
};

export const adminRoutes = (
  <>
    {/* Admin routes — consolidated into grouped tabs, each with
        in-page `?view=` segments (#2277). One route per group;
        AdminSection renders the segment pills + active view. */}
    {ADMIN_GROUPS.map((g) => (
      <Route
        key={g.id}
        path={g.path}
        element={
          <AdminLayout>
            <AdminSection group={g} elements={ADMIN_SECTION_ELEMENTS[g.id]} />
          </AdminLayout>
        }
      />
    ))}
    {/* Legacy `/admin/*` paths → consolidated group + `?view=` */}
    {Object.entries(ADMIN_LEGACY_REDIRECTS).map(([from, to]) => (
      <Route key={from} path={from} element={<Navigate to={to} replace />} />
    ))}
    {/* Admin pages reachable by direct URL only (not in the tab bar) */}
    <Route path="/admin/points"            element={<AdminLayout><AdminPoints /></AdminLayout>} />
    <Route path="/admin/help-mappings"     element={<AdminLayout><HelpMappings /></AdminLayout>} />
    <Route path="/admin/product-dashboard" element={<Navigate to="/admin/dashboard" replace />} />
  </>
);
