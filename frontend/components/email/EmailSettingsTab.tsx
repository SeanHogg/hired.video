/**
 * Email connections page in /settings — self-gating against Pro.
 *
 *   • Free user → single upgrade CTA card (both sub-tabs hidden;
 *     mailbox sync and user-authored rules are Pro-only features).
 *   • Pro user → two sub-tabs:
 *       - Inboxes — connected mailboxes, connect/disconnect, sync activity
 *       - Rules   — user-authored classification rules
 *
 * Hosts the OAuth callback toast (?connected=… / ?error=…) at this
 * level so the user sees it regardless of which sub-tab is active when
 * they land back from the consent screen.
 */

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { useToast } from "@/components/ui/use-toast";
import { EmailInboxesPanel } from "./EmailInboxesPanel";
import { EmailRulesPanel } from "./EmailRulesPanel";
import {
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
} from "@shared/pricing";

export function EmailSettingsTab() {
  const { isAuthenticated } = useAuth();
  const { isPro, loading: subLoading } = useSubscription();
  const { toast } = useToast();
  const [subTab, setSubTab] = useState("inboxes");

  // OAuth callback redirects land here with `?connected=gmail` or
  // `?error=…` — surface as a toast and strip from the URL so a refresh
  // doesn't re-fire it.
  useEffect(() => {
    if (!isAuthenticated) return;
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected");
    const errorCode = url.searchParams.get("error");
    if (connected) {
      toast({ title: "Mailbox connected", description: `Linked ${connected} account.` });
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    } else if (errorCode) {
      toast({
        title: "Connection failed",
        description: errorCode.replace(/_/g, " "),
        variant: "destructive",
      });
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [isAuthenticated, toast]);

  if (!isAuthenticated) return null;
  // Hold until we know the plan — beats flashing the Pro UI at Free users
  // (or vice versa) on first render.
  if (subLoading) return null;

  if (!isPro) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Inbox Sync
          </CardTitle>
          <CardDescription>
            Connect Gmail or Outlook, classify every recruiter pitch / ATS
            reply / interview invite into your unified inbox, and link
            messages to the jobs you've applied to — automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pro plans include {INBOX_SYNC_INCLUDED_ACCOUNTS} connected
            mailboxes. Need more? Extra inboxes are $
            {INBOX_SYNC_EXTRA_ACCOUNT_PRICE}/mo each.
          </p>
          <Link to="/pricing?upgrade=inbox-sync">
            <Button>Upgrade to Pro</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs value={subTab} onValueChange={setSubTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="inboxes">Inboxes</TabsTrigger>
        <TabsTrigger value="rules">Rules</TabsTrigger>
      </TabsList>
      <TabsContent value="inboxes" className="space-y-6">
        <EmailInboxesPanel />
      </TabsContent>
      <TabsContent value="rules" className="space-y-6">
        <EmailRulesPanel />
      </TabsContent>
    </Tabs>
  );
}
