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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";

interface ApplyJobButtonProps {
  jobId: string;
  jobTitle: string;
  companyName: string;
  onApplicationSubmitted?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function ApplyJobButton({
  jobId,
  jobTitle,
  companyName,
  onApplicationSubmitted,
  variant = "default",
  size = "default",
  className,
}: ApplyJobButtonProps) {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [coverLetter, setCoverLetter] = useState("");
  const [resumes, setResumes] = useState<Array<{ id: string; title: string }>>([]);

  const handleOpenDialog = async () => {
    if (!isAuthenticated) {
      toast.error("Please sign in to apply for jobs");
      return;
    }

    setIsOpen(true);

    // Fetch user's resumes
    try {
      // TODO: Replace with actual resume service call
      // const userResumes = await resumeService.getUserResumes();
      // setResumes(userResumes);
      
      // Mock data for now
      setResumes([
        { id: "1", title: "Software Engineer Resume" },
        { id: "2", title: "Full Stack Developer Resume" },
      ]);
    } catch {
      toast.error("Failed to load your resumes");
    }
  };

  const handleSubmit = async () => {
    if (!selectedResumeId) {
      toast.error("Please select a resume");
      return;
    }

    setIsSubmitting(true);

    try {
      await jobService.applyToJob(jobId, {
        resumeId: selectedResumeId,
        coverLetter: coverLetter.trim() || undefined,
      });

      toast.success("Application submitted successfully!");
      setIsOpen(false);
      setCoverLetter("");
      setSelectedResumeId("");
      onApplicationSubmitted?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit application";
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
        <Send className="mr-2 h-4 w-4" />
        Apply Now
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Apply for {jobTitle}</DialogTitle>
            <DialogDescription>
              Submit your application to {companyName}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="resume">Select Resume *</Label>
              <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                <SelectTrigger id="resume">
                  <SelectValue placeholder="Choose a resume" />
                </SelectTrigger>
                <SelectContent>
                  {resumes.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No resumes available
                    </SelectItem>
                  ) : (
                    resumes.map((resume) => (
                      <SelectItem key={resume.id} value={resume.id}>
                        {resume.title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {resumes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  You need to create a resume first.{" "}
                  <a href="/resumes/create" className="text-primary hover:underline">
                    Create one now
                  </a>
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="coverLetter">Cover Letter (Optional)</Label>
              <Textarea
                id="coverLetter"
                placeholder="Tell the employer why you're a great fit for this role..."
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={8}
                className="resize-none"
              />
              <p className="text-sm text-muted-foreground">
                {coverLetter.length} / 2000 characters
              </p>
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
              disabled={isSubmitting || !selectedResumeId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Application
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

