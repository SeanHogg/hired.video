/**
 * Email connections page in /settings — two sub-tabs:
 *   • Inboxes — connected mailboxes, connect/disconnect, sync activity
 *   • Rules   — user-authored classification rules
 *
 * Hosts the OAuth callback toast (?connected=… / ?error=…) at this
 * level so the user sees it regardless of which sub-tab is active when
 * they land back from the consent screen.
 */

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { EmailInboxesPanel } from "./EmailInboxesPanel";
import { EmailRulesPanel } from "./EmailRulesPanel";

export function EmailSettingsTab() {
  const { isAuthenticated } = useAuth();
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

export default EmailSettingsTab;
