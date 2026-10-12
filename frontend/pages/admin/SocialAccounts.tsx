// /admin/social-accounts — SuperAdmin "Managed Accounts" surface (PRD §4.4,
// Layer 2 of §5.0). The SuperAdmin connects hired.video's OWN brand account
// per platform; once connected, the free Lane A ("post via hired.video") goes
// live for every user. Also surfaces the developer-app (Layer 1) status so
// the SA can see WHY a platform isn't live yet.
//
// Mounted under <AdminLayout> in App.tsx (SuperAdmin-gated route).

import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertTriangle, Plug, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { socialService, type ManagedPlatformStatus } from "@/lib/services/social-service";
import type { SocialPlatform, ManagedLaneState } from "@shared/social-platforms";

const MANAGED_LABEL: Record<ManagedLaneState, { text: string; tone: "ok" | "warn" | "off" }> = {
  ready: { text: "Live — free lane active", tone: "ok" },
  not_connected: { text: "App configured · brand account not connected", tone: "warn" },
  not_configured: { text: "Developer app not configured (Secrets)", tone: "off" },
  unsupported: { text: "No managed lane", tone: "off" },
};

export default function SocialAccountsPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");
  const platformParam = searchParams.get("platform");
  const reason = searchParams.get("reason");

  const qc = useQueryClient();
  const managedQ = useQuery({
    queryKey: ["admin", "social", "managed"],
    queryFn: () => socialService.listManaged(),
  });

  const connectM = useMutation({
    mutationFn: (platform: SocialPlatform) => socialService.getManagedAuthUrl(platform),
    onSuccess: (url) => { window.location.href = url; },
  });
  const disconnectM = useMutation({
    mutationFn: (platform: SocialPlatform) => socialService.disconnectManaged(platform),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "social", "managed"] }),
  });

  return (
    <div className="py-8 px-4 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Managed social accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect hired.video's own brand accounts. Once a platform's brand account is
          connected, the free "Post via hired.video" lane is live for every user.
          Each platform also needs its developer-app credentials in Worker Secrets first.
        </p>
        {status === "connected" && (
          <div className="mt-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">
            {platformParam ?? "Brand account"} connected — the free lane is now live.
          </div>
        )}
        {status === "error" && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">
            Couldn't connect{platformParam ? ` ${platformParam}` : ""}: {reason ?? "unknown error"}
          </div>
        )}
      </header>

      {managedQ.isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading platforms…
        </p>
      ) : (
        <div className="space-y-3">
          {(managedQ.data ?? [])
            .filter((p) => p.supportsManagedLane)
            .map((p) => (
              <ManagedRow
                key={p.id}
                p={p}
                connecting={connectM.isPending && connectM.variables === p.id}
                disconnecting={disconnectM.isPending && disconnectM.variables === p.id}
                onConnect={() => connectM.mutate(p.id)}
                onDisconnect={() => disconnectM.mutate(p.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function ManagedRow({
  p, connecting, disconnecting, onConnect, onDisconnect,
}: {
  p: ManagedPlatformStatus;
  connecting: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const lane = MANAGED_LABEL[p.managed];
  const connected = p.account?.status === "active";
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{p.label}</span>
            {p.managed === "ready" ? (
              <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Live</Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                {lane.tone === "off" ? <AlertTriangle className="h-3 w-3" /> : null}
                {p.configured ? "Not connected" : "Not configured"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {connected && p.account?.handle ? `Brand account: ${p.account.handle}` : lane.text}
          </p>
        </div>

        <div className="shrink-0">
          {connected ? (
            <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Link2Off className="h-4 w-4 mr-1" /> Disconnect</>}
            </Button>
          ) : (
            <Button size="sm" onClick={onConnect} disabled={!p.configured || connecting} title={!p.configured ? "Add the developer-app secret first" : undefined}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plug className="h-4 w-4 mr-1" /> Connect brand account</>}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
