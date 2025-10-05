import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";

interface CreateJobAlertButtonProps {
  initialKeywords?: string;
  initialLocation?: string;
  onAlertCreated?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function CreateJobAlertButton({
  initialKeywords = "",
  initialLocation = "",
  onAlertCreated,
  variant = "default",
  size = "default",
  className,
}: CreateJobAlertButtonProps) {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertName, setAlertName] = useState("");
  const [keywords, setKeywords] = useState(initialKeywords);
  const [location, setLocation] = useState(initialLocation);
  const [frequency, setFrequency] = useState("daily");

  const handleOpenDialog = () => {
    if (!isAuthenticated) {
      toast.error("Please sign in to create job alerts");
      return;
    }

    setIsOpen(true);
  };

  const handleSubmit = async () => {
    if (!alertName.trim()) {
      toast.error("Please enter an alert name");
      return;
    }

    if (!keywords.trim()) {
      toast.error("Please enter keywords");
      return;
    }

    setIsSubmitting(true);

    try {
      await jobService.createJobAlert({
        name: alertName.trim(),
        keywords: keywords.trim(),
        location: location.trim() || undefined,
        frequency,
      });

      toast.success("Job alert created successfully!");
      setIsOpen(false);
      setAlertName("");
      setKeywords(initialKeywords);
      setLocation(initialLocation);
      setFrequency("daily");
      onAlertCreated?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create job alert";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleOpenDialog}
      >
        <Bell className="mr-2 h-4 w-4" />
        Create Job Alert
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Job Alert</DialogTitle>
            <DialogDescription>
              Get notified when new jobs match your criteria
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="alertName">Alert Name *</Label>
              <Input
                id="alertName"
                placeholder="e.g., Senior Developer Jobs"
                value={alertName}
                onChange={(e) => setAlertName(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="keywords">Keywords *</Label>
              <Input
                id="keywords"
                placeholder="e.g., React, TypeScript, Node.js"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Separate multiple keywords with commas
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="location">Location (Optional)</Label>
              <Input
                id="location"
                placeholder="e.g., San Francisco, CA"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="frequency">Notification Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !alertName.trim() || !keywords.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Bell className="mr-2 h-4 w-4" />
                  Create Alert
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

