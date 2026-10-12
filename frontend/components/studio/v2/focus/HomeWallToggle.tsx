import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { PUBLIC_VIDEO_FEED_QUERY_KEY } from "@/hooks/use-public-video-feed";

const key = (projectId: string) => ["studio", "home-wall", projectId] as const;

/**
 * "Show it on the hired.video home page" (gap #2354): a public video joins
 * the home page's wall and discovery unless its owner turns this off. Shows
 * once the project is saved and the viewer has an account.
 */
export default function HomeWallToggle({ projectId }: { projectId: string | null }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const enabled = Boolean(projectId) && isAuthenticated;
  const q = useQuery({
    queryKey: key(projectId ?? ""),
    queryFn: async () => (await apiClient.get<{ showOnHome: boolean }>(`/api/studio/projects/${projectId}/home-wall`)).data.showOnHome,
    enabled,
    retry: false,
  });
  const save = useMutation({
    mutationFn: async (showOnHome: boolean) =>
      (await apiClient.patch<{ showOnHome: boolean }>(`/api/studio/projects/${projectId}/home-wall`, { showOnHome })).data.showOnHome,
    onSuccess: (showOnHome) => {
      qc.setQueryData(key(projectId ?? ""), showOnHome);
      void qc.invalidateQueries({ queryKey: PUBLIC_VIDEO_FEED_QUERY_KEY });
    },
  });
  if (!enabled || q.data === undefined) return null;
  return (
    <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-[12px] border border-border bg-card px-3 py-2">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">{t("studio.share.homeWall")}</span>
        <span className="block text-xs text-muted-foreground">{t("studio.share.homeWallHint")}</span>
      </span>
      <Switch checked={q.data} disabled={save.isPending} onCheckedChange={(v) => save.mutate(v)} aria-label={t("studio.share.homeWall")} />
    </label>
  );
}
