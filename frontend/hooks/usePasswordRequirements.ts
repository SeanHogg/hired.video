import { useState, useEffect, useCallback } from "react";
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

interface UsePasswordRequirementsReturn {
  requirements: PasswordRequirements | null;
  isLoading: boolean;
  error: string | null;
  checkRequirements: () => Promise<void>;
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  handlePasswordChanged: () => void;
}

export const usePasswordRequirements = (): UsePasswordRequirementsReturn => {
  const { user, apiCall } = useAuth();
  const [requirements, setRequirements] = useState<PasswordRequirements | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const checkRequirements = useCallback(async () => {
    if (!user) {
      setRequirements(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiCall("/api/passwordmanagement/requirements");

      if (response.success) {
        const reqs = response.data as PasswordRequirements;
        setRequirements(reqs);

        // Show modal if password change is required
        if (reqs.requiresPasswordChange) {
          setShowModal(true);
        }
      } else {
        setError(
          response.error?.message || "Failed to check password requirements",
        );
      }
    } catch (error: unknown) {
      // Handle the specific case where the API returns PASSWORD_CHANGE_REQUIRED
      const errorObj = error as {
        message?: string;
        response?: {
          error?: { code?: string; message?: string; details?: any };
        };
      };
      if (
        errorObj.message === "PASSWORD_CHANGE_REQUIRED" ||
        (errorObj.response &&
          errorObj.response.error?.code === "PASSWORD_CHANGE_REQUIRED")
      ) {
        const errorDetails = errorObj.response?.error?.details;
        if (errorDetails) {
          const reqs: PasswordRequirements = {
            requiresPasswordChange: errorDetails.requiresPasswordChange || true,
            isTemporaryPassword: errorDetails.isTemporaryPassword || false,
            passwordSetDate: errorDetails.passwordSetDate,
            passwordExpiryDate: errorDetails.passwordExpiryDate,
            daysUntilExpiry: errorDetails.daysUntilExpiry || 0,
            reason:
              errorObj.response?.error?.message || "Password change required",
            canSkip: errorDetails.canSkip || false,
          };

          setRequirements(reqs);
          setShowModal(true);
        }
      } else {
        setError(
          errorObj.message ||
            "An error occurred while checking password requirements",
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, apiCall]);

  const handlePasswordChanged = useCallback(() => {
    setShowModal(false);
    setRequirements(null);

    // Optionally refresh the page or redirect
    window.location.reload();
  }, []);

  // Check requirements when user changes or component mounts
  useEffect(() => {
    if (user) {
      checkRequirements();
    }
  }, [user, checkRequirements]);

  // Set up an interval to periodically check requirements (every 5 minutes)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(
      () => {
        checkRequirements();
      },
      5 * 60 * 1000,
    ); // 5 minutes

    return () => clearInterval(interval);
  }, [user, checkRequirements]);

  return {
    requirements,
    isLoading,
    error,
    checkRequirements,
    showModal,
    setShowModal,
    handlePasswordChanged,
  };
};
