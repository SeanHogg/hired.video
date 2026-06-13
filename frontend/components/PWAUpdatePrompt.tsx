import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

// How often an already-open tab polls the server for a freshly-deployed
// service worker. `useRegisterSW` only checks once, at page load, so without
// this an installed/long-lived PWA session would never learn about a deploy
// until the user manually reloaded. A poll is a cheap conditional GET on the
// SW script; if the bytes changed the browser installs the new SW, which then
// waits (registerType: "prompt") and trips onNeedRefresh below.
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Once an update is detected, how long the user has before the app reloads
// itself to apply it. "Update Now" applies immediately; "Later" cancels the
// auto-reload for this session (the next deploy/poll re-prompts).
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

  const title = "New version of hired.video";
  const options: NotificationOptions = {
    body: `An update is ready. The app will refresh in ${AUTO_RELOAD_SECONDS}s to apply it.`,
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
  onUpdate,
  onLater,
}: {
  remaining: number;
  onUpdate: () => void;
  onLater: () => void;
}) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
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
          New Version Available!
        </div>
        <div style={{ fontSize: "12px", opacity: 0.85, lineHeight: 1.4 }}>
          Refreshing in {remaining}s to get the latest features and fixes.
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
            color: "#7c3aed",
            border: "none",
            borderRadius: "8px",
            padding: "6px 16px",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Update Now
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
          Later
        </button>
      </div>
    </div>
  );
}

export default function PWAUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    // Fired once the SW is registered. Stash the registration and start the
    // active update detection: a periodic poll for always-open sessions, plus
    // immediate checks whenever the user refocuses the tab or regains
    // connectivity — so returning to the installed app surfaces a new
    // deployment within seconds rather than waiting out the interval.
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      intervalRef.current = setInterval(() => {
        // Skip while offline — update() would just throw.
        if (!navigator.onLine) return;
        registration.update().catch(() => {
          /* transient network failure; the next tick retries */
        });
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  // Check for a new deployment the moment the user comes back to the app or
  // reconnects, independent of the polling interval above.
  useEffect(() => {
    const checkForUpdate = () => {
      const registration = registrationRef.current;
      if (!registration || !navigator.onLine) return;
      registration.update().catch(() => {
        /* ignore — periodic poll will retry */
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      if (intervalRef.current !== undefined) clearInterval(intervalRef.current);
    };
  }, []);

  // When an update is waiting: surface the OS banner + in-app toast, count
  // down from AUTO_RELOAD_SECONDS, and reload to apply unless the user opts
  // out. "Update Now" applies immediately; "Later" cancels the auto-reload.
  useEffect(() => {
    if (!needRefresh) return;

    const registration = registrationRef.current;
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
      updateServiceWorker(true);
    };

    const postpone = () => {
      clearInterval(timer);
      dismissOsNotification();
      toast.dismiss(TOAST_ID);
    };

    const render = () => (
      <UpdateToastCard
        remaining={remaining}
        onUpdate={applyUpdate}
        onLater={postpone}
      />
    );

    // OS-level banner (visible even when the app is backgrounded).
    void showUpdateNotification(registration);

    // In-app countdown toast.
    toast.custom(render, { id: TOAST_ID, duration: Infinity });

    timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        applyUpdate();
        return;
      }
      toast.custom(render, { id: TOAST_ID, duration: Infinity });
    }, 1000);

    return () => clearInterval(timer);
  }, [needRefresh, updateServiceWorker]);

  return null;
}
