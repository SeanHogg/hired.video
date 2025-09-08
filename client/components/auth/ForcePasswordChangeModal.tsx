import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Eye, EyeOff, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface PasswordRequirements {
  requiresPasswordChange: boolean;
  isTemporaryPassword: boolean;
  passwordSetDate?: string;
  passwordExpiryDate?: string;
  daysUntilExpiry: number;
  reason?: string;
  canSkip: boolean;
}

interface PasswordStrength {
  isValid: boolean;
  score: number;
  requirements: string[];
  suggestions: string[];
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumbers: boolean;
  hasSpecialChars: boolean;
  isNotCommon: boolean;
}

interface ForcePasswordChangeModalProps {
  isOpen: boolean;
  requirements: PasswordRequirements;
  onPasswordChanged: () => void;
  onClose?: () => void;
}

export const ForcePasswordChangeModal: React.FC<
  ForcePasswordChangeModalProps
> = ({ isOpen, requirements, onPasswordChanged, onClose }) => {
  const { apiCall } = useAuth();
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] =
    useState<PasswordStrength | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check password strength as user types
  useEffect(() => {
    if (formData.newPassword.length > 0) {
      checkPasswordStrength(formData.newPassword);
    } else {
      setPasswordStrength(null);
    }
  }, [formData.newPassword]);

  const checkPasswordStrength = async (password: string) => {
    try {
      const response = await apiCall(
        "/api/password-management/validate-strength",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(password),
        },
      );

      if (response.success) {
        setPasswordStrength(response.data);
      }
    } catch (error) {
      console.error("Error checking password strength:", error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.newPassword !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!passwordStrength?.isValid) {
      setError("Password does not meet security requirements");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiCall("/api/password-management/force-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: formData.newPassword,
          confirmPassword: formData.confirmPassword,
        }),
      });

      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          onPasswordChanged();
        }, 2000);
      } else {
        setError(response.error?.message || "Failed to change password");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while changing password";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const getStrengthText = (score: number) => {
    if (score >= 85) return "Strong";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Weak";
  };

  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Password Changed Successfully
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Your password has been updated successfully. You will be
              redirected shortly.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={requirements.canSkip ? onClose : undefined}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Password Change Required
          </DialogTitle>
          <DialogDescription>
            {requirements.reason ||
              "You must change your password to continue."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                name="newPassword"
                type={showPassword ? "text" : "password"}
                value={formData.newPassword}
                onChange={handleInputChange}
                placeholder="Enter your new password"
                required
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {passwordStrength && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Password Strength:</span>
                <span
                  className={`font-medium ${
                    passwordStrength.score >= 85
                      ? "text-green-600"
                      : passwordStrength.score >= 60
                        ? "text-yellow-600"
                        : passwordStrength.score >= 40
                          ? "text-orange-600"
                          : "text-red-600"
                  }`}
                >
                  {getStrengthText(passwordStrength.score)}
                </span>
              </div>
              <Progress value={passwordStrength.score} className="h-2" />

              {passwordStrength.requirements.length > 0 && (
                <div className="text-xs text-red-600 space-y-1">
                  {passwordStrength.requirements.map((req, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      {req}
                    </div>
                  ))}
                </div>
              )}

              {passwordStrength.suggestions.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="font-medium">Suggestions:</div>
                  {passwordStrength.suggestions.map((suggestion, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <span>•</span>
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm your new password"
                required
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isLoading}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {formData.confirmPassword &&
            formData.newPassword !== formData.confirmPassword && (
              <div className="text-xs text-red-600 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                Passwords do not match
              </div>
            )}

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              className="flex-1"
              disabled={
                isLoading ||
                !passwordStrength?.isValid ||
                formData.newPassword !== formData.confirmPassword ||
                !formData.newPassword ||
                !formData.confirmPassword
              }
            >
              {isLoading ? "Changing Password..." : "Change Password"}
            </Button>

            {requirements.canSkip && onClose && (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
              >
                Skip for Now
              </Button>
            )}
          </div>
        </form>

        {requirements.isTemporaryPassword && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <div className="text-sm text-amber-800">
              <strong>Temporary Password:</strong> You are currently using a
              temporary password. Please set a secure password to continue using
              your account.
            </div>
          </div>
        )}

        {requirements.daysUntilExpiry > 0 &&
          requirements.daysUntilExpiry <= 7 && (
            <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
              <div className="text-sm text-orange-800">
                <strong>Password Expiring:</strong> Your password will expire in{" "}
                {requirements.daysUntilExpiry} day(s).
              </div>
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
};
