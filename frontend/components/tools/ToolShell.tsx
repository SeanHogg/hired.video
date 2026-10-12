// Shared full-page shell for every `/tools/*` surface.
//
// Owns the chrome the tools used to copy-paste 13 times: AppShell wrap,
// padded container, soft-gate AuthOverlay, ToolPageHeader, FAQ + related
// blog footer (ToolFooterSEO), useSEO + useBreadcrumbs. Each tool now
// ships only its body — adding a new tool is a `<ToolShell>{...}</ToolShell>`
// drop-in, and the next "missing marketing / wrong padding / no footer"
// regression class disappears.
//
// The shell self-gates per the DRY rule:
//   - SEO + breadcrumbs run inside the shell, so consumers can't forget
//     them.
//   - AuthOverlay is rendered + positioned + relative-parent flagged
//     internally; consumers pass `{ show, message }` rather than wiring
//     the `relative` class themselves.
//   - ToolFooterSEO self-gates on its own pathname lookup; it's always
//     rendered here.
//   - Embedded in a host page (tool-embed.tsx — the kit stage tools'
//     slide-out) it renders the body alone: no AppShell, no SEO or
//     breadcrumbs (they would overwrite the host's), no nav strip, header
//     or footer — the host's panel carries the tool's title.

import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import AuthOverlay from "@/components/AuthOverlay";
import ToolFooterSEO from "@/components/ToolFooterSEO";
import { ToolNavStrip, ToolPageHeader } from "@/components/tools/ToolPageHeader";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { type ToolTier } from "@/data/tools-catalog";
import { cn } from "@/lib/utils";
import { useToolEmbed } from "@/lib/tools/tool-embed";

interface AuthOverlayConfig {
  /** Whether to render the soft-gate overlay. Pass `!isAuthenticated` for
   *  always-on, or wire it to a click handler for action-time gating. */
  show: boolean;
  /** Body copy shown inside the overlay card. */
  message: string;
  /** Override the overlay title. Defaults to `header.title` when it's a
   *  string. */
  title?: string;
}

interface Props {
  /** Catalog id. Drives ToolPageHeader → ToolAnonValueCard → ToolHistoryButton
   *  → ToolTierBadge → ToolCategoryBadge — every header sub-component
   *  resolves its data from this id. */
  toolId: string;
  header: {
    icon: ReactNode;
    title: ReactNode;
    description: ReactNode;
    titleExtras?: ReactNode;
    /** Force a tier label. Omit to let ToolTierBadge auto-resolve from
     *  the registry (PRO auto-shows; FREE only renders when forced). */
    tier?: ToolTier;
  };
  /** Soft-gate overlay shown when auth is required. Omit for tools that
   *  don't need a soft gate (e.g. fully public tools). */
  authOverlay?: AuthOverlayConfig;
  /** Override the breadcrumb tail label. Defaults to `header.title` when
   *  it's a string, else "Tool". */
  breadcrumbLabel?: string;
  children: ReactNode;
}

export function ToolShell(props: Props) {
  return useToolEmbed() ? <EmbeddedToolShell {...props} /> : <PageToolShell {...props} />;
}

/** The overlay's title: explicit, else the header title when it's a string. */
function overlayTitleOf({ authOverlay, header }: Props): string | undefined {
  return authOverlay?.title ?? (typeof header.title === "string" ? header.title : undefined);
}

function EmbeddedToolShell(props: Props) {
  const { authOverlay, children } = props;
  const showOverlay = authOverlay?.show === true;
  return (
    <div className={cn("flex flex-col gap-6", showOverlay && "relative min-h-[320px]")}>
      {showOverlay && (
        <AuthOverlay contentType="tool" title={overlayTitleOf(props)} message={authOverlay!.message} />
      )}
      {children}
    </div>
  );
}

function PageToolShell(props: Props) {
  const { toolId, header, authOverlay, breadcrumbLabel, children } = props;
  const location = useLocation();

  // Both required for every tool surface; running them inside the shell
  // means the tool body literally cannot forget them.
  useSEO(location.pathname);
  const { t } = useTranslation();
  useBreadcrumbs([
    { name: t("labels.tools.tabTools"), url: "/tools" },
    {
      name:
        breadcrumbLabel ??
        (typeof header.title === "string" ? header.title : t("tools.header.toolFallback")),
      url: location.pathname,
    },
  ]);

  const showOverlay = authOverlay?.show === true;
  const overlayTitle = overlayTitleOf(props);

  return (
    <AppShell bgClassName="bg-background">
      <div className={cn("p-4 md:p-6", showOverlay && "relative")}>
        {showOverlay && (
          <AuthOverlay
            contentType="tool"
            title={overlayTitle}
            message={authOverlay!.message}
          />
        )}
        <ToolNavStrip toolId={toolId} />
        {/* Header → input card → result card, in the shared 1200px column. */}
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 pb-12 pt-4">
          <ToolPageHeader
            toolId={toolId}
            icon={header.icon}
            title={header.title}
            description={header.description}
            titleExtras={header.titleExtras}
            tier={header.tier}
          />
          {children}
        </div>
      </div>
      <ToolFooterSEO />
    </AppShell>
  );
}
