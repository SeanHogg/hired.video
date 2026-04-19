import { Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Skill } from "@/types/resume";
import SectionEditButton from "./SectionEditButton";

interface SkillsSectionProps {
  /** Resume-format skills with levels */
  resumeSkills?: Skill[];
  /** Profile-level skills as simple strings */
  profileSkills?: string[];
  /** Profile-level industries */
  industries?: string[];
  isOwner: boolean;
  onEdit?: () => void;
  title?: string;
}

export default function SkillsSection({
  resumeSkills,
  profileSkills,
  industries,
  isOwner,
  onEdit,
  title = "Skills & Expertise",
}: SkillsSectionProps) {
  const hasResumeSkills = resumeSkills && resumeSkills.length > 0;
  const hasProfileSkills = profileSkills && profileSkills.length > 0;
  const hasIndustries = industries && industries.length > 0;
  const hasAnything = hasResumeSkills || hasProfileSkills || hasIndustries;

  if (!hasAnything && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          {title}
        </CardTitle>
        {isOwner && onEdit && <SectionEditButton onClick={onEdit} label="Edit skills" />}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Resume skills with levels */}
        {hasResumeSkills && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {resumeSkills!.map((skill, index) => (
                <div
                  key={skill.id || index}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">{skill.name}</div>
                    {skill.level && (
                      <div className="text-sm text-muted-foreground">{skill.level}</div>
                    )}
                  </div>
                  {skill.keywords && skill.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 ml-2">
                      {skill.keywords.slice(0, 3).map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profile-level skills as badges */}
        {hasProfileSkills && (
          <div>
            {hasResumeSkills && (
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Profile Skills
              </h4>
            )}
            <div className="flex flex-wrap gap-2">
              {profileSkills!.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Industries */}
        {hasIndustries && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Industries
            </h4>
            <div className="flex flex-wrap gap-2">
              {industries!.map((industry) => (
                <Badge key={industry} variant="outline">
                  {industry}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {!hasAnything && isOwner && (
          <p className="text-sm text-muted-foreground italic">
            No skills added yet. Add skills to showcase your expertise.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
