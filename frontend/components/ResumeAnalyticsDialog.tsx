import { BarChart3, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ResumeAnalyticsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resumeName: string;
  views?: number;
  downloads?: number;
}

export default function ResumeAnalyticsDialog({
  isOpen,
  onClose,
  resumeName,
  views = 0,
  downloads = 0,
}: ResumeAnalyticsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Resume Analytics
          </DialogTitle>
          <DialogDescription>
            Engagement summary for <span className="font-medium">{resumeName}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="rounded-md border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Eye className="w-3.5 h-3.5" /> Views
            </div>
            <div className="text-3xl font-semibold mt-1">{views.toLocaleString()}</div>
          </div>
          <div className="rounded-md border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Download className="w-3.5 h-3.5" /> Downloads
            </div>
            <div className="text-3xl font-semibold mt-1">{downloads.toLocaleString()}</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Per-viewer breakdown, referrer attribution, and time-on-page analytics are on the roadmap — see the gap register.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
