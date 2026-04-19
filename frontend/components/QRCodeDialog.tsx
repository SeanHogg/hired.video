import { useEffect, useState } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface QRCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  filename?: string;
}

// Lazy-loaded QR lib — same CDN-ESM pattern used for TTS engines in tts-engines.ts.
// Kept out of the main bundle; loaded on first dialog open and cached by the browser.
const QRCODE_CDN = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
let qrcodeModulePromise: Promise<any> | null = null;
function loadQrcode() {
  if (!qrcodeModulePromise) qrcodeModulePromise = import(/* @vite-ignore */ QRCODE_CDN);
  return qrcodeModulePromise;
}

export default function QRCodeDialog({ isOpen, onClose, url, title, filename }: QRCodeDialogProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setDataUrl(null);
    setError(null);
    loadQrcode()
      .then((mod) => mod.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "M" }))
      .then((png: string) => {
        if (!cancelled) setDataUrl(png);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error)?.message || "Could not render QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, url]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: url });
    } catch {
      toast({ title: "Could not copy", description: "Clipboard access denied.", variant: "destructive" });
    }
  };

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${filename ?? "resume-qr"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? "QR Code"}</DialogTitle>
          <DialogDescription>
            Scan with a phone camera to open this resume. Useful for in-person networking, business cards, and printed materials.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="w-64 h-64 flex items-center justify-center rounded-md border bg-white">
            {error ? (
              <p className="text-xs text-destructive px-4 text-center">{error}</p>
            ) : dataUrl ? (
              <img src={dataUrl} alt="QR code" className="w-full h-full" />
            ) : (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="w-full flex items-center gap-2">
            <Input value={url} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={handleCopyLink} title="Copy link">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={handleDownload} disabled={!dataUrl}>
            <Download className="w-4 h-4 mr-2" />
            Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
