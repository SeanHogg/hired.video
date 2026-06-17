import React, { useState } from "react";
import { UserPlus, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InviteUserRequest,
  getAvailableRolesForInvite,
} from "@/types/account";
import { getRoleDisplayLabel } from "@/lib/role-utils";

interface InviteUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (data: InviteUserRequest) => Promise<void>;
  currentUserRoles: string[];
}

export function InviteUserModal({
  open,
  onOpenChange,
  onInvite,
  currentUserRoles,
}: InviteUserModalProps) {
  const [email, setEmail] = useState("");
  // One role per invitee — the invite model assigns exactly one role and the
  // invitee fills in their own name at signup, so we no longer collect
  // name/message fields that the backend ignored (gaps #1673/#1678).
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const availableRoles = getAvailableRolesForInvite(currentUserRoles);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!selectedRole) {
      newErrors.role = "Please select a role";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await onInvite({
        email: email.trim(),
        role: selectedRole as InviteUserRequest["role"],
      });

      // Reset form
      setEmail("");
      setSelectedRole("");
      setErrors({});
    } catch {
      // Error handling is done in parent component
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = (role: string) => {
    setSelectedRole((prev) => (prev === role ? "" : role));
    if (errors.role) {
      setErrors((prev) => ({ ...prev, role: "" }));
    }
  };

  const getRoleDescription = (role: string): string => {
    switch (role) {
      case "admin":
        return "Can manage users, settings, and account configuration";
      case "recruiter":
        return "Can post jobs, manage candidates, and access recruitment tools";
      case "employer":
        return "Can post jobs and manage hiring processes";
      case "job_seeker":
        return "Can create resumes and apply to jobs";
      default:
        return "Standard user access";
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite Team Member
          </SheetTitle>
          <SheetDescription>
            Send an invitation to join your account with specific roles and
            permissions.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-4 space-y-6"
        >
          {/* Email */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-4 w-4" />
                Who are you inviting?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@company.com"
                  className={errors.email ? "border-red-500" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-red-500 mt-1">{errors.email}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  They'll get an email link and set up their own profile when they accept.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Role Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Role *</CardTitle>
              <CardDescription>
                Select the role this person will have in your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {availableRoles.map((role) => (
                  <div key={role} className="flex items-start space-x-3">
                    <input
                      type="radio"
                      name="invite-role"
                      id={`role-${role}`}
                      checked={selectedRole === role}
                      onChange={() => handleRoleSelect(role)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor={`role-${role}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {getRoleDisplayLabel(role)}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {getRoleDescription(role)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {errors.role && (
                <p className="text-sm text-red-500 mt-2">{errors.role}</p>
              )}
            </CardContent>
          </Card>
        </form>

        <SheetFooter className="px-6 py-4 border-t bg-background">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {loading ? "Sending..." : "Send Invitation"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
