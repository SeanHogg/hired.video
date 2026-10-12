import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { contentScanService, type OwnerScan } from "@/lib/services/content-scan-service";
import { useExplicitCategoryList } from "@/hooks/use-explicit-category-list";

const POLL_MS = 10_000;
/** Stop polling after ~2 minutes; a reopened panel asks again. */
const MAX_POLLS = 12;

/**
 * The home-wall explicit scan, as the owner sees it in the Post panel: why a
 * video is kept off the hired.video home page (the category — never the
 * offending content), or that it's still being checked. Nothing once it
 * passes or before it was ever scanned.
 */
export default function PublicScanNotice({ projectId }: { projectId: string | null }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const listCategories = useExplicitCategoryList();
  const q = useQuery<OwnerScan | null>({
    queryKey: ["studio", "public-scan", projectId ?? ""],
    queryFn: () => contentScanService.getProjectScan(projectId ?? ""),
    enabled: Boolean(projectId) && isAuthenticated,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      const settled = data?.verdict === "pass" || data?.verdict === "block";
      return !settled && query.state.dataUpdateCount < MAX_POLLS ? POLL_MS : false;
    },
  });
  const scan = q.data;
  if (!scan || scan.verdict === "pass") return null;

  if (scan.verdict === "unscreened") {
    return (
      <p role="status" className="flex items-start gap-2 rounded-[12px] border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
        {t("moderation.scan.checking")}
      </p>
    );
  }

  return (
    <div role="alert" className="flex items-start gap-2 rounded-[12px] border border-destructive/40 bg-destructive/10 px-3 py-2">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">{t("moderation.scan.blockedTitle")}</span>
        <span className="block text-xs text-muted-foreground">
          {scan.categories.length > 0
            ? t("moderation.scan.blockedBody", { categories: listCategories(scan.categories) })
            : t("moderation.scan.blockedBodyGeneric")}
        </span>
      </span>
    </div>
  );
}
