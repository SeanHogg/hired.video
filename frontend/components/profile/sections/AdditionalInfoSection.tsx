import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface AdditionalInfoSectionProps {
  languages?: string[];
  interests?: string[];
  /** Owner-only metadata — suppress for visitors. */
  memberSince?: string;
  lastActive?: string;
  showOwnerMeta?: boolean;
}

export default function AdditionalInfoSection({
  languages = [],
  interests = [],
  memberSince,
  lastActive,
  showOwnerMeta = false,
}: AdditionalInfoSectionProps) {
  const hasLanguages = languages.length > 0;
  const hasInterests = interests.length > 0;
  const hasOwnerMeta = showOwnerMeta && (memberSince || lastActive);

  if (!hasLanguages && !hasInterests && !hasOwnerMeta) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasLanguages && (
          <div>
            <h4 className="font-medium text-sm mb-2">Languages</h4>
            <div className="flex flex-wrap gap-1">
              {languages.map((language, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {language}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {hasInterests && (
          <div>
            <h4 className="font-medium text-sm mb-2">Interests</h4>
            <div className="flex flex-wrap gap-1">
              {interests.map((interest, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {interest}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {hasOwnerMeta && (
          <>
            {(hasLanguages || hasInterests) && <Separator />}
            <div className="space-y-2 text-sm">
              {memberSince && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Member since</span>
                  <span>{memberSince}</span>
                </div>
              )}
              {lastActive && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last active</span>
                  <span>{lastActive}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
