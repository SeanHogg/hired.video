// "Push on this browser" row for Settings → Notifications. Registers or
// removes this browser's Web Push endpoint. Self-gating: renders nothing
// where push can't work (no PushManager, or push not configured server-side).
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useWebPushDevice } from "@/hooks/useWebPushDevice";

export function PushDeviceToggle() {
  const { t } = useTranslation();
  const { state, busy, failed, enable, disable } = useWebPushDevice();

  if (state === null || state === "unsupported") return null;

  const subscribed = state === "subscribed";
  const status = failed
    ? t("settings.notifications.pushDevice.error")
    : t(`settings.notifications.pushDevice.${state}`);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <Label className="text-sm font-medium">{t("settings.notifications.pushDevice.label")}</Label>
        <p className={failed ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role="status">
          {status}
        </p>
      </div>
      {state !== "denied" && (
        <Button
          type="button"
          variant={subscribed ? "outline" : "default"}
          className="min-h-[44px]"
          disabled={busy}
          onClick={subscribed ? disable : enable}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {subscribed
            ? t("settings.notifications.pushDevice.disable")
            : t("settings.notifications.pushDevice.enable")}
        </Button>
      )}
    </div>
  );
}
