// /settings/connections — Layer 3 of the social connection model (PRD §5.0):
// each user connects their OWN social accounts, enabling Lane B ("post to my
// account", Pro-gated). Lane availability is read from the shared
// useSocialPublishEntitlement hook (the SSoT the publish lane chooser also
// uses), so this page never re-derives "can I post to X".
//
// Mirrors the /settings/ads (PaidMediaPage) connection surface.

import { useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { SocialConnectionsList } from "@/components/social/SocialConnectionsList";

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

      <SocialConnectionsList />
    </div>
    </AppShell>
  );
}
