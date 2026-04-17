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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { roleToSelectValue, getAvailableRoles } from "@/lib/role-utils";

interface EditProfessionalInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditProfessionalInfoDialog({
  open,
  onOpenChange,
}: EditProfessionalInfoDialogProps) {
  const { user, updateProfile, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    company: "",
    role: "",
  });

  useEffect(() => {
    if (open && user) {
      setForm({
        title: user.currentRole || "",
        company: user.currentCompany || "",
        role: roleToSelectValue(user.role),
      });
    }
  }, [open, user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfile({
        currentRole: form.title,
        currentCompany: form.company,
      });
      refreshUser().catch(() => {});
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save professional info:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Professional Information</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="editRole">Professional Role</Label>
            <Select
              value={form.role}
              onValueChange={(value) => setForm((f) => ({ ...f, role: value }))}
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getAvailableRoles().map((roleOption) => (
                  <SelectItem key={roleOption.value} value={roleOption.value}>
                    {roleOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editTitle">Job Title</Label>
            <Input
              id="editTitle"
              placeholder="e.g. Senior Software Engineer"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editCompany">Company</Label>
            <Input
              id="editCompany"
              placeholder="e.g. Tech Corp"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
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
