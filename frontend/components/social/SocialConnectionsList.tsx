// SocialConnectionsList — the ONE connect/disconnect surface for a user's own
// social accounts (PRD §5.0, Lane B). DRY seam: both the Settings ▸ Integrations
// card and the standalone /settings/connections page render this so the list of
// connectable platforms shows inline in both places (no "click through to a
// button" indirection). The component self-gates from useSocialPublishEntitlement
// (the SSoT the publish lane chooser also uses), so it never re-derives
// "can I post to X".

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle2, Plus, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { socialService } from "@/lib/services/social-service";
import {
  useSocialPublishEntitlement,
  socialPlatformsKey,
} from "@/lib/hooks/useSocialPublishEntitlement";
import type { SocialPlatform } from "@shared/social-platforms";

export function SocialConnectionsList() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { platforms, isLoading } = useSocialPublishEntitlement();
  const connectionsQ = useQuery({
    queryKey: ["social", "connections"],
    queryFn: () => socialService.listConnections(),
  });

  const connectM = useMutation({
    mutationFn: (platform: SocialPlatform) => socialService.getAuthUrl(platform),
    onSuccess: (url) => { window.location.href = url; },
  });
  const disconnectM = useMutation({
    mutationFn: (platform: SocialPlatform) => socialService.disconnect(platform),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: socialPlatformsKey });
      qc.invalidateQueries({ queryKey: ["social", "connections"] });
    },
  });

  const byPlatform = new Map((connectionsQ.data ?? []).map((c) => [c.platform, c]));

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("social.loadingPlatforms")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {platforms
        // Only networks whose developer app is configured can be connected.
        .filter((p) => p.selfOffered)
        .map((p) => {
          const conn = byPlatform.get(p.meta.id);
          const connected = p.selfConnected && conn?.status === "active";
          return (
            <Card key={p.meta.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.meta.label}</span>
                    {connected ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {t("social.connected")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {connected && conn?.handle
                      ? conn.handle
                      : p.meta.connectNote}
                  </p>
                </div>

                <div className="shrink-0">
                  {connected ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => disconnectM.mutate(p.meta.id)}
                      disabled={disconnectM.isPending}
                    >
                      <Link2Off className="h-4 w-4 mr-1" /> {t("social.disconnect")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => connectM.mutate(p.meta.id)}
                      disabled={connectM.isPending}
                    >
                      {connectM.isPending && connectM.variables === p.meta.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><Plus className="h-4 w-4 mr-1" /> {t("social.connect")}</>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
