import { Camera, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { uploadAvatar } from "@/lib/services/upload-service";

interface EditHeaderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditHeaderDialog({ open, onOpenChange }: EditHeaderDialogProps) {
  const { user, updateProfile, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    headline: "",
    location: "",
  });

  useEffect(() => {
    if (open && user) {
      setForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        headline: user.headline || "",
        location: user.location || "",
      });
    }
  }, [open, user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        headline: form.headline,
        location: form.location,
      });
      refreshUser().catch(() => {});
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save profile header:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      setSaving(true);
      const avatarUrl = await uploadAvatar(file);
      if (avatarUrl) {
        await updateProfile({ profilePicture: avatarUrl });
        await refreshUser();
      }
    } catch (err) {
      console.error("Avatar upload failed", err);
    } finally {
      setSaving(false);
    }
  };

  const initials = `${form.firstName?.[0] || ""}${form.lastName?.[0] || ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="w-16 h-16">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
              </Avatar>
              <label
                htmlFor="avatarUpload"
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center cursor-pointer hover:opacity-90"
              >
                <Camera className="h-3.5 w-3.5" />
              </label>
              <input
                id="avatarUpload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarUpload(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">Click the camera icon to change your photo</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="editFirstName">First Name</Label>
              <Input
                id="editFirstName"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editLastName">Last Name</Label>
              <Input
                id="editLastName"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editHeadline">Headline</Label>
            <Input
              id="editHeadline"
              placeholder="e.g. Full-Stack Developer | React & Node.js Expert"
              value={form.headline}
              onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
              className="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">A brief professional tagline</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editLocation">Location</Label>
            <Input
              id="editLocation"
              placeholder="City, State, Country"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>
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
