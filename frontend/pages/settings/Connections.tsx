// /settings/connections — Layer 3 of the social connection model (PRD §5.0):
// each user connects their OWN social accounts, enabling Lane B ("post to my
// account", Pro-gated). Lane availability is read from the shared
// useSocialPublishEntitlement hook (the SSoT the publish lane chooser also
// uses), so this page never re-derives "can I post to X".
//
// Mirrors the /settings/ads (PaidMediaPage) connection surface.

import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Plus, Link2Off } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { socialService } from "@/lib/services/social-service";
import {
  useSocialPublishEntitlement,
  socialPlatformsKey,
} from "@/lib/hooks/useSocialPublishEntitlement";
import type { SocialPlatform } from "@shared/social-platforms";

export default function ConnectionsPage() {
  useSEO("/settings/connections");
  useBreadcrumbs([
    { name: "Settings", url: "/settings" },
    { name: "Connected accounts", url: "/settings/connections" },
  ]);
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");
  const platformParam = searchParams.get("platform");
  const reason = searchParams.get("reason");

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

  return (
    <AppShell bgClassName="bg-background">
    <div className="py-8 px-4 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Connected accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your social accounts to publish your Studio content directly to them.
          Free members can always publish through hired.video's own channels instead.
        </p>
        {status === "connected" && (
          <div className="mt-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">
            {platformParam ?? "Account"} connected.
          </div>
        )}
        {status === "error" && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">
            Couldn't connect{platformParam ? ` ${platformParam}` : ""}: {reason ?? "unknown error"}
          </div>
        )}
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading platforms…
        </p>
      ) : (
        <div className="space-y-3">
          {platforms
            .filter((p) => p.meta.supportsSelfLane)
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
                            <CheckCircle2 className="h-3 w-3" /> Connected
                          </Badge>
                        ) : p.needsUpgrade ? (
                          <Badge variant="outline">Pro</Badge>
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
                          <Link2Off className="h-4 w-4 mr-1" /> Disconnect
                        </Button>
                      ) : p.needsUpgrade ? (
                        <Button asChild size="sm" variant="default">
                          <a href="/upgrade">Upgrade to connect</a>
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
                            <><Plus className="h-4 w-4 mr-1" /> Connect</>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
    </AppShell>
  );
}
