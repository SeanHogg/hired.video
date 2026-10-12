import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { resumeService } from "@/lib/services/resume-service";

interface RenameResumeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resumeId: string;
  currentName: string;
  onRenamed?: (newName: string) => void;
}

export default function RenameResumeDialog({
  isOpen,
  onClose,
  resumeId,
  currentName,
  onRenamed,
}: RenameResumeDialogProps) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) setName(currentName);
  }, [isOpen, currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Name required", description: "Please enter a resume name.", variant: "destructive" });
      return;
    }
    if (trimmed === currentName) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await resumeService.updateResumeData(resumeId, { title: trimmed });
      toast({ title: "Renamed", description: `Resume renamed to "${trimmed}".` });
      onRenamed?.(trimmed);
      onClose();
    } catch (err) {
      toast({
        title: "Rename failed",
        description: (err as Error)?.message || "Could not rename this resume.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename Resume</DialogTitle>
            <DialogDescription>
              Change the name of this resume. The slug and public URL may update to match.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="resume-name">Resume name</Label>
            <Input
              id="resume-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior Engineer — 2026"
              autoFocus
              disabled={saving}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
