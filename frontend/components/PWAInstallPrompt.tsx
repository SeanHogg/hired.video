import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";

export default function PWAInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed this session
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    // iOS detection — Safari doesn't fire beforeinstallprompt
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window.navigator as any).standalone;
    if (ios) {
      setIsIOS(true);
      setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setShow(false);
  };

  if (!show) return null;

  return (
    <div data-print-hide className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-80 z-50 bg-card border rounded-xl shadow-lg p-4 flex items-start gap-3 print:hidden">
      <div className="flex-shrink-0 bg-brand-primary/10 rounded-lg p-2">
        <Download className="h-5 w-5 text-brand-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Install hired.video</p>
        {isIOS ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">
            Add to your home screen for faster access.
          </p>
        )}
        {!isIOS && (
          <Button size="sm" className="mt-2 h-7 text-xs bg-primary" onClick={install}>
            Install
          </Button>
        )}
      </div>
      <button onClick={dismiss} className="flex-shrink-0 text-muted-foreground hover:text-foreground" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
