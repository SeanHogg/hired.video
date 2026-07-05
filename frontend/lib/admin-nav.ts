/**
 * Admin navigation registry — the single source of truth for the Admin Panel's
 * consolidated top-level groups and their in-page segments (#2277).
 *
 * Replaces the old flat 26-tab strip. Tabs that were merely different filtered
 * views over the same entity/resource (Users vs Active Users, Studio vs Page
 * Videos vs Social Accounts, Roles vs Role Access, …) now collapse into ONE
 * top-level group whose segments swap via a `?view=` query param — no page or
 * feature is removed, each surviving as a segment.
 *
 * Both consumers read from here so there is no drift:
 *   - AdminLayout       → renders the top-level group tabs
 *   - AdminSection       → renders the per-group segment pills + active view
 *
 * Visibility is decided per-segment (never prop-drilled): a segment shows when
 * the role can read its `resource` (admin-permissions) AND the SuperAdmin hasn't
 * hidden `admin_tab:<resource>` for that role (role-access manifest). A group
 * shows when at least one of its segments is visible. Content rendering lives in
 * App.tsx (`ADMIN_SECTION_ELEMENTS`) so the pages stay lazy-loaded.
 */
import type React from "react";
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  CreditCard,
  Cpu,
  HardDrive,
  Mail,
  Megaphone,
  MonitorPlay,
  Package,
  Plug,
  ScrollText,
  Settings,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  Wand2,
  Workflow,
  Puzzle,
} from "lucide-react";
import type { AdminResource } from "@/lib/admin-permissions";

export interface AdminSegment {
  /** CRUD resource this segment gates on (admin-permissions + role-access). */
  resource: AdminResource;
  /** `?view=` token. Empty string = the group's only/default view (no pills). */
  view: string;
  /** i18n key for the pill label. */
  labelKey: string;
  icon: React.ElementType;
}

export interface AdminGroup {
  /** Stable id — used as the React key and the ADMIN_SECTION_ELEMENTS key. */
  id: string;
  /** Base route, e.g. `/admin/users`. */
  path: string;
  /** i18n key for the top-level tab label. */
  labelKey: string;
  icon: React.ElementType;
  segments: AdminSegment[];
}

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    id: "dashboard",
    path: "/admin/dashboard",
    labelKey: "admin.nav.group.dashboard",
    icon: BarChart3,
    segments: [
      { resource: "dashboard", view: "", labelKey: "admin.nav.group.dashboard", icon: BarChart3 },
    ],
  },
  {
    id: "users",
    path: "/admin/users",
    labelKey: "admin.nav.group.users",
    icon: Users,
    segments: [
      { resource: "users", view: "registered", labelKey: "admin.nav.seg.registered", icon: Users },
      { resource: "accountAnalytics", view: "live", labelKey: "admin.nav.seg.live", icon: Activity },
    ],
  },
  {
    id: "companies",
    path: "/admin/companies",
    labelKey: "admin.nav.group.companies",
    icon: Building2,
    segments: [
      { resource: "companies", view: "", labelKey: "admin.nav.group.companies", icon: Building2 },
    ],
  },
  {
    id: "access",
    path: "/admin/access",
    labelKey: "admin.nav.group.access",
    icon: ShieldCheck,
    segments: [
      { resource: "roles", view: "roles", labelKey: "admin.nav.seg.roles", icon: Shield },
      { resource: "roleAccess", view: "modules", labelKey: "admin.nav.seg.modules", icon: ShieldCheck },
    ],
  },
  {
    id: "feed",
    path: "/admin/feed",
    labelKey: "admin.nav.group.feed",
    icon: Megaphone,
    segments: [
      { resource: "feed", view: "notifications", labelKey: "admin.nav.seg.notifications", icon: Megaphone },
      { resource: "feed", view: "dashboard", labelKey: "admin.nav.seg.dashboardCards", icon: Sparkles },
      { resource: "campaigns", view: "campaigns", labelKey: "admin.nav.seg.campaigns", icon: Mail },
    ],
  },
  {
    id: "studio",
    path: "/admin/studio",
    labelKey: "admin.nav.group.studio",
    icon: Video,
    segments: [
      { resource: "studio", view: "content", labelKey: "admin.nav.seg.content", icon: Video },
      { resource: "studio", view: "embeds", labelKey: "admin.nav.seg.pageEmbeds", icon: MonitorPlay },
      { resource: "studio", view: "social", labelKey: "admin.nav.seg.social", icon: Share2 },
    ],
  },
  {
    id: "jobs",
    path: "/admin/jobs",
    labelKey: "admin.nav.group.jobs",
    icon: Briefcase,
    segments: [
      { resource: "jobs", view: "", labelKey: "admin.nav.group.jobs", icon: Briefcase },
    ],
  },
  {
    id: "insights",
    path: "/admin/insights",
    labelKey: "admin.nav.group.insights",
    icon: Activity,
    segments: [
      { resource: "accountAnalytics", view: "accounts", labelKey: "admin.nav.seg.accounts", icon: BarChart3 },
      { resource: "toolUsage", view: "tools", labelKey: "admin.nav.seg.toolUsage", icon: Wand2 },
      { resource: "extensionTelemetry", view: "extension", labelKey: "admin.nav.seg.extension", icon: Puzzle },
    ],
  },
  {
    id: "trust",
    path: "/admin/trust",
    labelKey: "admin.nav.group.trust",
    icon: ShieldAlert,
    segments: [
      { resource: "moderation", view: "moderation", labelKey: "admin.nav.seg.moderation", icon: ShieldCheck },
      { resource: "security", view: "security", labelKey: "admin.nav.seg.security", icon: ShieldAlert },
      { resource: "audit", view: "audit", labelKey: "admin.nav.seg.audit", icon: ScrollText },
    ],
  },
  {
    id: "billing",
    path: "/admin/billing",
    labelKey: "admin.nav.group.billing",
    icon: CreditCard,
    segments: [
      { resource: "billing", view: "", labelKey: "admin.nav.group.billing", icon: CreditCard },
    ],
  },
  {
    id: "modules",
    path: "/admin/modules",
    labelKey: "admin.nav.group.modules",
    icon: Package,
    segments: [
      { resource: "modules", view: "", labelKey: "admin.nav.group.modules", icon: Package },
    ],
  },
  {
    id: "partners",
    path: "/admin/partners",
    labelKey: "admin.nav.group.partners",
    icon: Plug,
    segments: [
      { resource: "partners", view: "", labelKey: "admin.nav.group.partners", icon: Plug },
    ],
  },
  {
    id: "system",
    path: "/admin/system",
    labelKey: "admin.nav.group.system",
    icon: Settings,
    segments: [
      { resource: "settings", view: "settings", labelKey: "admin.nav.seg.settings", icon: Settings },
      { resource: "storage", view: "storage", labelKey: "admin.nav.seg.storage", icon: HardDrive },
      { resource: "workers", view: "workers", labelKey: "admin.nav.seg.workers", icon: Workflow },
      { resource: "aiVendors", view: "ai-vendors", labelKey: "admin.nav.seg.aiVendors", icon: Cpu },
    ],
  },
];

/** Legacy `/admin/*` paths → consolidated group route + `?view=` (deep-link safety). */
export const ADMIN_LEGACY_REDIRECTS: Record<string, string> = {
  "/admin/active-users": "/admin/users?view=live",
  "/admin/roles": "/admin/access?view=roles",
  "/admin/role-access": "/admin/access?view=modules",
  "/admin/dashboard-feed": "/admin/feed?view=dashboard",
  "/admin/campaigns": "/admin/feed?view=campaigns",
  "/admin/page-embeds": "/admin/studio?view=embeds",
  "/admin/social-accounts": "/admin/studio?view=social",
  "/admin/account-analytics": "/admin/insights?view=accounts",
  "/admin/tool-usage": "/admin/insights?view=tools",
  "/admin/extension-telemetry": "/admin/insights?view=extension",
  "/admin/moderation": "/admin/trust?view=moderation",
  "/admin/security": "/admin/trust?view=security",
  "/admin/audit": "/admin/trust?view=audit",
  "/admin/settings": "/admin/system?view=settings",
  "/admin/storage": "/admin/system?view=storage",
  "/admin/workers": "/admin/system?view=workers",
  "/admin/ai-vendors": "/admin/system?view=ai-vendors",
};
