import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

export default function PWAUpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;

    toast.custom(
      (t) => (
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
              Get the latest features and fixes.
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
            <button
              onClick={() => {
                toast.dismiss(t);
                updateServiceWorker(true);
              }}
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
              onClick={() => toast.dismiss(t)}
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
      ),
      { duration: Infinity },
    );
  }, [needRefresh, updateServiceWorker]);

  return null;
}
