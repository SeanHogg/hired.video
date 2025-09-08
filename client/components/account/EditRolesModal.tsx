import React, { useState, useEffect } from "react";
import { Shield, User, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AccountUser,
  getRoleDisplayName,
  getAvailableRolesForInvite,
} from "@/types/account";

interface EditRolesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AccountUser;
  onUpdateRoles: (userId: string, roles: string[]) => Promise<void>;
  currentUserRoles: string[];
}

export function EditRolesModal({
  open,
  onOpenChange,
  user,
  onUpdateRoles,
  currentUserRoles,
}: EditRolesModalProps) {
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const availableRoles = getAvailableRolesForInvite(currentUserRoles);

  useEffect(() => {
    if (user?.rolesAssigned) {
      setSelectedRoles([...user.rolesAssigned]);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedRoles.length === 0) {
      return;
    }

    setLoading(true);
    try {
      await onUpdateRoles(user.userId, selectedRoles);
    } catch {
      // Error handling is done in parent component
    } finally {
      setLoading(false);
    }
  };

  const handleRoleToggle = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const getRoleDescription = (role: string): string => {
    switch (role) {
      case "Admin":
        return "Can manage users, settings, and account configuration";
      case "Recruiter":
        return "Can post jobs, manage candidates, and access recruitment tools";
      case "Employer":
        return "Can post jobs and manage hiring processes";
      case "JobSeeker":
        return "Can create resumes and apply to jobs";
      default:
        return "Standard user access";
    }
  };

  const hasChanges = () => {
    const currentRoles = user.rolesAssigned || [];
    if (currentRoles.length !== selectedRoles.length) return true;
    return !currentRoles.every((role) => selectedRoles.includes(role));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Edit User Roles
          </DialogTitle>
          <DialogDescription>
            Update the roles and permissions for this team member.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* User Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-4 w-4" />
                User Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={user.avatarUrl} />
                  <AvatarFallback>
                    {user.firstName?.[0]}
                    {user.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium text-lg">
                    {user.firstName} {user.lastName}
                  </h3>
                  <p className="text-gray-600">{user.email}</p>
                  <div className="flex gap-1 mt-2">
                    <span className="text-sm text-gray-500">
                      Current roles:
                    </span>
                    {user.rolesAssigned?.map((role) => (
                      <Badge key={role} variant="outline" className="text-xs">
                        {getRoleDisplayName(role)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Role Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Role Assignment</CardTitle>
              <CardDescription>
                Select the roles this user will have in your account. You can
                assign multiple roles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {availableRoles.map((role) => (
                  <div key={role} className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      id={`edit-role-${role}`}
                      checked={selectedRoles.includes(role)}
                      onChange={() => handleRoleToggle(role)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor={`edit-role-${role}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {getRoleDisplayName(role)}
                      </Label>
                      <p className="text-xs text-gray-600 mt-1">
                        {getRoleDescription(role)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {selectedRoles.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 mb-2">
                    New Roles:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedRoles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {getRoleDisplayName(role)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedRoles.length === 0 && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-600">
                    Please select at least one role for this user.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Changes Summary */}
          {hasChanges() && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900">
                      Role Changes Detected
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      The user's roles will be updated when you save these
                      changes.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </form>

        <DialogFooter>
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
            disabled={loading || selectedRoles.length === 0 || !hasChanges()}
            className="flex items-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
