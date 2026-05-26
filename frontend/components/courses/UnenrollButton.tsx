import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { courseService } from "@/lib/services/course-service";

interface UnenrollButtonProps {
  courseId: string;
  courseTitle: string;
  // Self-gates: passed enrollments expose a cert that cascades on delete, so
  // the backend refuses with 409 CERTIFICATE_ISSUED and the surface hides the
  // affordance. Component returns null in that case.
  isPassed: boolean;
  onUnenrolled?: () => void;
  size?: "sm" | "default";
  variant?: "outline" | "ghost";
  className?: string;
}

export function UnenrollButton({
  courseId,
  courseTitle,
  isPassed,
  onUnenrolled,
  size = "sm",
  variant = "outline",
  className,
}: UnenrollButtonProps) {
  const [unenrolling, setUnenrolling] = useState(false);
  if (isPassed) return null;

  const handleConfirm = async () => {
    setUnenrolling(true);
    try {
      await courseService.unenroll(courseId);
      toast({
        title: "Unenrolled",
        description: `You've been unenrolled from ${courseTitle}. Your progress was cleared.`,
      });
      onUnenrolled?.();
    } catch (err) {
      toast({
        title: "Couldn't unenroll",
        description: (err as Error).message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setUnenrolling(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={unenrolling}
          className={className}
        >
          {unenrolling ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1" /> Unenrolling…
            </>
          ) : (
            <>Unenroll</>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unenroll from this course?</AlertDialogTitle>
          <AlertDialogDescription>
            Your progress will be cleared and you'll lose access to the
            lessons. You can re-enroll any time. Free to rejoin later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Yes, unenroll
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
