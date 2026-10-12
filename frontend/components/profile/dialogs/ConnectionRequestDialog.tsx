import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface ConnectionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetFirstName: string;
  busy?: boolean;
  onSubmit: (message: string) => Promise<void> | void;
}

export default function ConnectionRequestDialog({
  open,
  onOpenChange,
  targetFirstName,
  busy = false,
  onSubmit,
}: ConnectionRequestDialogProps) {
  const { t } = useTranslation();
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("headings.sendConnectionRequest")}</DialogTitle>
          <DialogDescription>
            {t("labels.connectionMessageIntro", { name: targetFirstName })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            placeholder={t("fields.connectionMessage.placeholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={busy}>
              <Send className="h-4 w-4 mr-2" />
              {t("actions.sendRequest")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
