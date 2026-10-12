import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { hasUnsavedWork } from "@/hooks/use-unsaved-work";
import { useServiceWorkerUpdate } from "@/hooks/use-service-worker-update";
import { installOfflineSaveQueue } from "@/lib/autosave/offline-save-queue";

// Once an update is detected, how long the user has before the app reloads
// itself to apply it. "Update Now" applies immediately; "Later" cancels the
// auto-reload for this build (the next deploy re-prompts). The countdown
// holds while an editor has work the server hasn't saved yet (#1991), so an
// unattended tab never reloads over it.
const AUTO_RELOAD_SECONDS = 30;

// Stable ids so repeated renders update the SAME toast / OS notification
// rather than stacking a new one every countdown tick.
const TOAST_ID = "pwa-update-available";
const NOTIFICATION_TAG = "pwa-update-available";

// Show an OS-level notification (system banner) so the user is told a new
// version exists even when the PWA window is backgrounded or minimised — the
// in-app toast alone is invisible in that state. Uses the SW registration's
// showNotification when available (required for installed PWAs on mobile),
// falling back to the page-level Notification constructor on desktop.
async function showUpdateNotification(
  registration: ServiceWorkerRegistration | undefined,
  t: TFunction,
) {
  if (typeof Notification === "undefined") return;

  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return;
    }
  }
  if (permission !== "granted") return;

  const title = t("pwaUpdate.notificationTitle");
  const options: NotificationOptions = {
    body: t("pwaUpdate.notificationBody", { seconds: AUTO_RELOAD_SECONDS }),
    tag: NOTIFICATION_TAG,
    icon: "/pwa-192x192.png",
    badge: "/pwa-64x64.png",
  };

  try {
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    /* notification display failed; the in-app toast still covers it */
  }
}

function UpdateToastCard({
  remaining,
  waitingForSave,
  onUpdate,
  onLater,
}: {
  remaining: number;
  waitingForSave: boolean;
  onUpdate: () => void;
  onLater: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
        color: "#fff",
        borderRadius: "12px",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        boxShadow: "0 8px 32px rgba(124,58,237,0.45)",
        minWidth: "320px",
        maxWidth: "400px",
        border: "1px solid rgba(255,255,255,0.2)",
      }}
    >
      {/* Animated pulse icon */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px",
          }}
        >
          🚀
        </div>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "2px" }}>
          {t("pwaUpdate.title")}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.85, lineHeight: 1.4 }}>
          {waitingForSave
            ? t("pwaUpdate.waitingForSave")
            : t("pwaUpdate.body", { seconds: remaining })}
        </div>
      </div>

      {/* Buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onUpdate}
          style={{
            background: "#fff",
            color: "#2563eb",
            border: "none",
            borderRadius: "8px",
            padding: "6px 16px",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {t("pwaUpdate.updateNow")}
        </button>
        <button
          onClick={onLater}
          style={{
            background: "transparent",
            color: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: "8px",
            padding: "4px 16px",
            fontWeight: 500,
            fontSize: "12px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {t("pwaUpdate.later")}
        </button>
      </div>
    </div>
  );
}

export default function PWAUpdatePrompt() {
  const { t } = useTranslation();
  const { waiting, registration, applyUpdate: activateWaiting } = useServiceWorkerUpdate();
  // The waiting build the user chose "Later" for; the next deploy is a new
  // worker and prompts again.
  const postponedRef = useRef<ServiceWorker | null>(null);

  // Autosave writes that were queued while offline (a tab closed before it
  // reconnected) are delivered at app start and on every reconnect (#2242).
  // Mounted once at the app root, like this prompt, so it lives here.
  useEffect(() => {
    installOfflineSaveQueue();
  }, []);

  // When an update is waiting: surface the OS banner + in-app toast, count
  // down from AUTO_RELOAD_SECONDS, and reload to apply unless the user opts
  // out. "Update Now" applies immediately; "Later" cancels the auto-reload.
  useEffect(() => {
    if (!waiting || postponedRef.current === waiting) return;

    let remaining = AUTO_RELOAD_SECONDS;
    let timer: ReturnType<typeof setInterval>;

    const dismissOsNotification = () => {
      registration
        ?.getNotifications?.({ tag: NOTIFICATION_TAG })
        .then((ns) => ns.forEach((n) => n.close()))
        .catch(() => {});
    };

    const applyUpdate = () => {
      clearInterval(timer);
      dismissOsNotification();
      toast.dismiss(TOAST_ID);
      // Posts SKIP_WAITING to the waiting SW, then reloads on controllerchange.
      activateWaiting();
    };

    const postpone = () => {
      postponedRef.current = waiting;
      clearInterval(timer);
      dismissOsNotification();
      toast.dismiss(TOAST_ID);
    };

    const render = () => (
      <UpdateToastCard
        remaining={remaining}
        waitingForSave={hasUnsavedWork()}
        onUpdate={applyUpdate}
        onLater={postpone}
      />
    );

    // OS-level banner (visible even when the app is backgrounded).
    void showUpdateNotification(registration, t);

    // In-app countdown toast.
    toast.custom(render, { id: TOAST_ID, duration: Infinity });

    timer = setInterval(() => {
      // Unsaved edits pause the countdown; it resumes once they're saved.
      if (!hasUnsavedWork()) remaining -= 1;
      if (remaining <= 0) {
        applyUpdate();
        return;
      }
      toast.custom(render, { id: TOAST_ID, duration: Infinity });
    }, 1000);

    return () => {
      clearInterval(timer);
      toast.dismiss(TOAST_ID);
    };
  }, [waiting, registration, activateWaiting, t]);

  return null;
}
