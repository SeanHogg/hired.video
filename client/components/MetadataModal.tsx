import { useState, useEffect } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResumeSectionMeta, MetaType } from "@/types/resume";

interface MetadataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
  initialMetadata?: ResumeSectionMeta[];
  onSave: (metadata: ResumeSectionMeta[]) => Promise<void>;
}

export default function MetadataModal({
  open,
  onOpenChange,
  resumeId,
  initialMetadata = [],
  onSave,
}: MetadataModalProps) {
  const [metaData, setMetaData] = useState<ResumeSectionMeta[]>(initialMetadata);
  const [saving, setSaving] = useState(false);

  const tryUuid = () => (typeof crypto !== "undefined" && 'randomUUID' in crypto ? (crypto).randomUUID() : `${Math.random().toString(16).slice(2)}-${Date.now()}`);

  // Reset metadata when modal opens with new data
  useEffect(() => {
    if (open) {
      setMetaData(initialMetadata);
    }
  }, [open, initialMetadata]);

  const addMeta = () => {
    const newMeta: ResumeSectionMeta = {
      id: tryUuid(),
      userId: "", // Will be set by the backend
      referenceId: "", // User will select this
      name: "",
      metaType: MetaType.Hyperlink,
      url: "",
      description: "",
    };
    setMetaData(prev => [...prev, newMeta]);
  };

  const updateMeta = (index: number, field: keyof ResumeSectionMeta, value: string | number) => {
    setMetaData(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } as ResumeSectionMeta : m));
  };

  const removeMeta = (index: number) => {
    setMetaData(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(metaData);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save metadata:", error);
      // TODO: Show error toast
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setMetaData(initialMetadata); // Reset to initial state
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Resume Media</DialogTitle>
          <DialogDescription>
            Add videos, images, and links to enhance your resume sections.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMeta}
            >
              Add Media
            </Button>
          </div>

          {metaData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No media added yet. Click "Add Media" to associate links, images, or videos with your resume.
            </p>
          ) : (
            <div className="space-y-4">
              {metaData.map((m, i) => (
                <div key={m.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 border rounded-lg p-4">
                  <div className="md:col-span-2">
                    <Label>Label</Label>
                    <Input 
                      value={m.name} 
                      onChange={(e) => updateMeta(i, "name", e.target.value)} 
                      placeholder="e.g., Demo Reel" 
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>URL</Label>
                    <Input 
                      value={m.url} 
                      onChange={(e) => updateMeta(i, "url", e.target.value)} 
                      placeholder="https://..." 
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={String(m.metaType)} onValueChange={(val) => updateMeta(i, "metaType", Number(val))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={String(MetaType.Hyperlink)}>Link</SelectItem>
                        <SelectItem value={String(MetaType.Image)}>Image</SelectItem>
                        <SelectItem value={String(MetaType.YouTube)}>YouTube</SelectItem>
                        <SelectItem value={String(MetaType.VideoMP4)}>Video (MP4)</SelectItem>
                        <SelectItem value={String(MetaType.VideoWebM)}>Video (WebM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Section</Label>
                    <Select value={m.referenceId || ""} onValueChange={(val) => updateMeta(i, "referenceId", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basics">Basics</SelectItem>
                        <SelectItem value="work">Work Experience</SelectItem>
                        <SelectItem value="education">Education</SelectItem>
                        <SelectItem value="skills">Skills</SelectItem>
                        <SelectItem value="projects">Projects</SelectItem>
                        <SelectItem value="volunteer">Volunteer</SelectItem>
                        <SelectItem value="languages">Languages</SelectItem>
                        <SelectItem value="awards">Awards</SelectItem>
                        <SelectItem value="certificates">Certificates</SelectItem>
                        <SelectItem value="publications">Publications</SelectItem>
                        <SelectItem value="interests">Interests</SelectItem>
                        <SelectItem value="references">References</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-6">
                    <Label>Description</Label>
                    <Textarea 
                      rows={2} 
                      value={m.description || ""} 
                      onChange={(e) => updateMeta(i, "description", e.target.value)} 
                      placeholder="Optional description for this media item" 
                    />
                  </div>
                  <div className="md:col-span-6 flex justify-end">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeMeta(i)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Media"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
