/**
 * Shared "Connect Gmail / Connect Outlook" button row.
 *
 * Single source of truth for the OAuth-start affordance — used by the
 * Settings Integrations section and by the inbox empty-state CTA. Per
 * the DRY rule the connect logic lives in one place; consumers compose
 * it without re-declaring the buttons or the URL builder.
 */

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  emailIntegrationService,
  type EmailProviderId,
} from "@/lib/services/email-integration-service";

export interface ConnectMailboxButtonsProps {
  /** Where to return to after the OAuth round-trip. Defaults to the
   *  Settings integrations tab so the user lands back on the surface
   *  where they manage mailboxes. Inbox-side callers pass the inbox
   *  URL so the user lands back on the inbox they just lit up. */
  redirect?: string;
}

const PROVIDERS: Array<{ id: EmailProviderId; label: string }> = [
  { id: "gmail", label: "Connect Gmail" },
  { id: "outlook", label: "Connect Outlook" },
];

export function ConnectMailboxButtons({ redirect }: ConnectMailboxButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROVIDERS.map((p) => (
        <Button
          key={p.id}
          variant="outline"
          onClick={() => {
            window.location.href = emailIntegrationService.connectUrl(p.id, redirect);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> {p.label}
        </Button>
      ))}
    </div>
  );
}

export default ConnectMailboxButtons;
