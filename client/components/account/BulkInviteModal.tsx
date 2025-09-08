import React, { useState } from "react";
import { Upload, Users, X, Plus, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BulkInviteUsersRequest,
  BulkInviteUserItem,
  BulkInviteUsersResponse,
  getRoleDisplayName,
  getAvailableRolesForInvite,
} from "@/types/account";

interface BulkInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBulkInvite: (
    data: BulkInviteUsersRequest,
  ) => Promise<BulkInviteUsersResponse>;
  currentUserRoles: string[];
}

export function BulkInviteModal({
  open,
  onOpenChange,
  onBulkInvite,
  currentUserRoles,
}: BulkInviteModalProps) {
  const [users, setUsers] = useState<BulkInviteUserItem[]>([]);
  const [defaultRoles, setDefaultRoles] = useState<string[]>([]);
  const [defaultMessage, setDefaultMessage] = useState("");
  const [csvInput, setCsvInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkInviteUsersResponse | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const availableRoles = getAvailableRolesForInvite(currentUserRoles);

  const handleAddUser = () => {
    setUsers([...users, { email: "", firstName: "", lastName: "" }]);
  };

  const handleRemoveUser = (index: number) => {
    setUsers(users.filter((_, i) => i !== index));
  };

  const handleUserChange = (
    index: number,
    field: keyof BulkInviteUserItem,
    value: string,
  ) => {
    const updatedUsers = [...users];
    updatedUsers[index] = { ...updatedUsers[index], [field]: value };
    setUsers(updatedUsers);
  };

  const handleRoleToggle = (role: string) => {
    setDefaultRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const parseCsvInput = () => {
    if (!csvInput.trim()) return;

    const lines = csvInput.trim().split("\n");
    const newUsers: BulkInviteUserItem[] = [];
    const parseErrors: string[] = [];

    lines.forEach((line, index) => {
      const [email, firstName, lastName] = line.split(",").map((s) => s.trim());

      if (!email) {
        parseErrors.push(`Line ${index + 1}: Email is required`);
        return;
      }

      if (!email.includes("@")) {
        parseErrors.push(`Line ${index + 1}: Invalid email format`);
        return;
      }

      newUsers.push({
        email,
        firstName: firstName || "",
        lastName: lastName || "",
      });
    });

    if (parseErrors.length > 0) {
      setErrors(parseErrors);
      return;
    }

    setUsers([...users, ...newUsers]);
    setCsvInput("");
    setErrors([]);
  };

  const validateForm = () => {
    const validationErrors: string[] = [];

    if (users.length === 0) {
      validationErrors.push("At least one user must be added");
    }

    if (defaultRoles.length === 0) {
      validationErrors.push("At least one default role must be selected");
    }

    users.forEach((user, index) => {
      if (!user.email) {
        validationErrors.push(`User ${index + 1}: Email is required`);
      } else if (!user.email.includes("@")) {
        validationErrors.push(`User ${index + 1}: Invalid email format`);
      }
    });

    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const request: BulkInviteUsersRequest = {
        users,
        defaultRoles,
        defaultMessage: defaultMessage.trim() || undefined,
      };

      const response = await onBulkInvite(request);
      setResult(response);

      if (response.failureCount === 0) {
        // All successful, close modal after a delay
        setTimeout(() => {
          handleClose();
        }, 2000);
      }
    } catch {
      setErrors(["Failed to send bulk invitations. Please try again."]);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUsers([]);
    setDefaultRoles([]);
    setDefaultMessage("");
    setCsvInput("");
    setResult(null);
    setErrors([]);
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const csvContent =
      "email,firstName,lastName\nexample@company.com,John,Doe\nuser@domain.com,Jane,Smith";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-invite-template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (result) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Bulk Invitation Results
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {result.totalProcessed}
                  </p>
                  <p className="text-sm text-gray-600">Total Processed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {result.successCount}
                  </p>
                  <p className="text-sm text-gray-600">Successful</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {result.failureCount}
                  </p>
                  <p className="text-sm text-gray-600">Failed</p>
                </CardContent>
              </Card>
            </div>

            {result.failedInvitations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-red-600">
                    Failed Invitations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.failedInvitations.map((failure, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center p-2 bg-red-50 rounded"
                      >
                        <span className="font-medium">{failure.email}</span>
                        <span className="text-sm text-red-600">
                          {failure.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Invite Users
          </DialogTitle>
          <DialogDescription>
            Invite multiple users to your account at once. You can add users
            manually or import from CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Errors */}
          {errors.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Default Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Default Settings</CardTitle>
              <CardDescription>
                These settings will apply to all users unless overridden
                individually.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Default Roles */}
              <div>
                <Label className="text-base font-medium">Default Roles</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {availableRoles.map((role) => (
                    <Badge
                      key={role}
                      variant={
                        defaultRoles.includes(role) ? "default" : "outline"
                      }
                      className="cursor-pointer"
                      onClick={() => handleRoleToggle(role)}
                    >
                      {getRoleDisplayName(role)}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Default Message */}
              <div>
                <Label htmlFor="defaultMessage">
                  Default Message (Optional)
                </Label>
                <Textarea
                  id="defaultMessage"
                  value={defaultMessage}
                  onChange={(e) => setDefaultMessage(e.target.value)}
                  placeholder="Add a personal message to all invitations..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* CSV Import */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Import from CSV
              </CardTitle>
              <CardDescription>
                Paste CSV data or download our template to get started.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={downloadTemplate} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              <div>
                <Label htmlFor="csvInput">
                  CSV Data (email, firstName, lastName)
                </Label>
                <Textarea
                  id="csvInput"
                  value={csvInput}
                  onChange={(e) => setCsvInput(e.target.value)}
                  placeholder="email@example.com,John,Doe&#10;user@company.com,Jane,Smith"
                  rows={4}
                />
              </div>

              <Button onClick={parseCsvInput} disabled={!csvInput.trim()}>
                Parse CSV Data
              </Button>
            </CardContent>
          </Card>

          {/* Manual User Entry */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Users to Invite ({users.length})</span>
                <Button onClick={handleAddUser} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No users added yet. Click "Add User" or import from CSV to get
                  started.
                </p>
              ) : (
                <div className="space-y-4">
                  {users.map((user, index) => (
                    <div
                      key={index}
                      className="flex gap-4 items-end p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <Label htmlFor={`email-${index}`}>Email *</Label>
                        <Input
                          id={`email-${index}`}
                          type="email"
                          value={user.email}
                          onChange={(e) =>
                            handleUserChange(index, "email", e.target.value)
                          }
                          placeholder="user@example.com"
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={`firstName-${index}`}>First Name</Label>
                        <Input
                          id={`firstName-${index}`}
                          value={user.firstName || ""}
                          onChange={(e) =>
                            handleUserChange(index, "firstName", e.target.value)
                          }
                          placeholder="John"
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={`lastName-${index}`}>Last Name</Label>
                        <Input
                          id={`lastName-${index}`}
                          value={user.lastName || ""}
                          onChange={(e) =>
                            handleUserChange(index, "lastName", e.target.value)
                          }
                          placeholder="Doe"
                        />
                      </div>
                      <Button
                        onClick={() => handleRemoveUser(index)}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading || users.length === 0 || defaultRoles.length === 0
            }
          >
            {loading
              ? "Sending..."
              : `Send ${users.length} Invitation${users.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
