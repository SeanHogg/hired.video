import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { resumeService } from "@/lib/services/resume-service";

interface CreateVariationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  masterResumeId: string;
  masterResumeName: string;
  onVariationCreated: () => void;
}

export default function CreateVariationDialog({
  isOpen,
  onClose,
  masterResumeId,
  masterResumeName,
  onVariationCreated,
}: CreateVariationDialogProps) {
  const [variationName, setVariationName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!variationName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a name for the variation.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      await resumeService.createResumeVariation(masterResumeId, variationName.trim());
      
      toast({
        title: "Success",
        description: "Resume variation created successfully!",
      });

      // Reset form
      setVariationName("");
      setDescription("");
      
      // Notify parent component
      onVariationCreated();
      onClose();
    } catch (error) {
      console.error("Error creating resume variation:", error);
      toast({
        title: "Error",
        description: "Failed to create resume variation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setVariationName("");
      setDescription("");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Resume Variation</DialogTitle>
          <DialogDescription>
            Create a new variation based on your master resume "{masterResumeName}".
            This will copy all content from the master resume, which you can then customize.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="variation-name">Variation Name *</Label>
            <Input
              id="variation-name"
              value={variationName}
              onChange={(e) => setVariationName(e.target.value)}
              placeholder="e.g., Software Engineer - Frontend Focus"
              maxLength={200}
              disabled={isCreating}
              required
            />
            <p className="text-xs text-muted-foreground">
              Give your variation a descriptive name that reflects its purpose or target role.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what makes this variation unique..."
              maxLength={1000}
              disabled={isCreating}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Optional description to help you remember the purpose of this variation.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating || !variationName.trim()}>
              {isCreating ? "Creating..." : "Create Variation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
