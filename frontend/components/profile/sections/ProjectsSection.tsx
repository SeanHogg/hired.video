import { ExternalLink, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Project } from "@/types/resume";
import SectionEditButton from "./SectionEditButton";

interface ProjectsSectionProps {
  projects: Project[];
  isOwner: boolean;
  onEdit?: () => void;
}

export default function ProjectsSection({ projects, isOwner, onEdit }: ProjectsSectionProps) {
  if (projects.length === 0 && !isOwner) return null;

  const formatDate = (dateString: string) => {
    if (!dateString || dateString === "Present") return dateString || "";
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return dateString;
    return dateObj.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Projects
        </CardTitle>
        {isOwner && onEdit && (
          <SectionEditButton onClick={onEdit} label="Edit projects" />
        )}
      </CardHeader>
      <CardContent>
        {projects.length > 0 ? (
          <div className="space-y-4">
            {projects.map((project, index) => (
              <div key={project.Id || index} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{project.Name}</h3>
                    {project.Entity && (
                      <p className="text-sm text-muted-foreground">{project.Entity}</p>
                    )}
                  </div>
                  {project.Url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={project.Url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
                {(project.StartDate || project.EndDate) && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {formatDate(project.StartDate)}
                    {project.StartDate && project.EndDate ? " - " : ""}
                    {formatDate(project.EndDate) || "Present"}
                    {project.Roles && project.Roles.length > 0 &&
                      ` \u00B7 ${project.Roles.join(", ")}`}
                  </p>
                )}
                {project.Description && (
                  <p className="text-sm mb-3">{project.Description}</p>
                )}
                {project.Keywords && project.Keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {project.Keywords.map((tech, techIndex) => (
                      <Badge key={techIndex} variant="secondary" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No projects added yet. Edit your master resume to add projects.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
