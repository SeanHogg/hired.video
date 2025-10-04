/**
 * SaveJobButton Component
 * Allows users to save/bookmark jobs for later viewing
 */

import { Bookmark } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";
import { toast } from "sonner";

interface SaveJobButtonProps {
  jobId: string;
  initialSaved?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
  onSaveChange?: (saved: boolean) => void;
}

export default function SaveJobButton({
  jobId,
  initialSaved = false,
  variant = "ghost",
  size = "icon",
  showLabel = false,
  onSaveChange,
}: SaveJobButtonProps) {
  const { isAuthenticated } = useAuth();
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error("Please sign in to save jobs");
      return;
    }

    setIsLoading(true);

    try {
      if (isSaved) {
        await jobService.unsaveJob(jobId);
        setIsSaved(false);
        toast.success("Job removed from saved");
        onSaveChange?.(false);
      } else {
        await jobService.saveJob(jobId);
        setIsSaved(true);
        toast.success("Job saved successfully");
        onSaveChange?.(true);
      }
    } catch (error) {
      console.error("Error toggling job save:", error);
      toast.error(
        isSaved ? "Failed to unsave job" : "Failed to save job"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleToggleSave}
      disabled={isLoading}
      className={isSaved ? "text-primary" : ""}
      title={isSaved ? "Remove from saved jobs" : "Save job"}
    >
      <Bookmark
        className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`}
      />
      {showLabel && (
        <span className="ml-2">{isSaved ? "Saved" : "Save"}</span>
      )}
    </Button>
  );
}

