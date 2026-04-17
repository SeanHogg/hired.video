import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";

interface EditAboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditAboutDialog({ open, onOpenChange }: EditAboutDialogProps) {
  const { user, updateProfile, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (open && user) {
      setBio(user.bio || "");
    }
  }, [open, user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfile({ bio });
      refreshUser().catch(() => {});
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save bio:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit About</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="editBio">About You</Label>
          <Textarea
            id="editBio"
            placeholder="Tell us about yourself, your experience, and what you're looking for..."
            rows={6}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {bio.length}/2000 characters
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
