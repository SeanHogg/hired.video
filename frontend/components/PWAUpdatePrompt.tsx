import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

export default function PWAUpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;

    toast("A new version is available", {
      description: "Update now to get the latest features and fixes.",
      duration: Infinity,
      action: {
        label: "Update",
        onClick: () => updateServiceWorker(true),
      },
      onDismiss: () => {
        // User dismissed — they'll get it on next navigation/reload
      },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
