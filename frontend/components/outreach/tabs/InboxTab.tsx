/**
 * InboxTab — unified messages, notifications, and connection requests.
 * Thin wrapper around the shared InboxPanel so the same inbox surface
 * appears here and in the header overlay.
 */
import { MessageCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InboxPanel } from "@/components/communication/InboxPanel";
import type { useCommHub } from "@/hooks/use-comm-hub";

export interface InboxTabProps {
  hub: ReturnType<typeof useCommHub>;
}

export function InboxTab({ hub }: InboxTabProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Inbox
        </CardTitle>
        <CardDescription>
          Messages, notifications, and pending connection requests.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <InboxPanel
          hub={hub}
          hideHeader
          heightClassName="min-h-[32rem] max-h-[70vh]"
        />
      </CardContent>
    </Card>
  );
}

export default InboxTab;
