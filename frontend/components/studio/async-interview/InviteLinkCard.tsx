import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CopyStateIcon } from "./InviteButtons";
import { useCopyFeedback } from "./useCopyFeedback";

/** Post-create banner with the shareable invite link. */
export function InviteLinkCard({
  inviteUrl,
  onDismiss,
}: {
  inviteUrl: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyFeedback(inviteUrl);

  return (
    <Card className="border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center gap-2 text-green-800 dark:text-green-300">
          <Check className="h-5 w-5" />
          <span className="font-medium">{t("studio.asyncInterview.createdSuccess")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={inviteUrl}
            className="flex-1 text-sm bg-card dark:bg-green-950/50"
          />
          <Button variant="outline" size="icon" onClick={copy}>
            <CopyStateIcon copied={copied} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("studio.asyncInterview.shareLinkHint")}
        </p>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t("actions.dismiss")}
        </Button>
      </CardContent>
    </Card>
  );
}
