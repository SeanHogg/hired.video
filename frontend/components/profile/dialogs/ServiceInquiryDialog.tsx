import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceOffering } from "@/lib/services/services-service";

interface ServiceInquiryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceOffering | null;
  providerFirstName?: string;
  busy?: boolean;
  onSubmit: (message: string) => Promise<void> | void;
}

export default function ServiceInquiryDialog({
  open,
  onOpenChange,
  service,
  providerFirstName,
  busy = false,
  onSubmit,
}: ServiceInquiryDialogProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    await onSubmit(message);
    setMessage("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setMessage("");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Quote</DialogTitle>
          <DialogDescription>
            {service?.title} — send a message to {providerFirstName ?? "the provider"}{" "}
            to get pricing details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Textarea
            rows={4}
            placeholder="Describe your needs, timeline, or any specific requirements..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={handleSubmit}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Send Request
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
