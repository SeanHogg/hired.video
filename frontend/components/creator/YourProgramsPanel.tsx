import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2,
  X,
  Check,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  creatorService,
  legalService,
  CREATOR_PROGRAMS,
  CREATOR_PROGRAM_LABEL,
  CREATOR_PROGRAM_HOME,
  CREATOR_PROGRAM_ICON,
  CREATOR_PROGRAM_TERMS_KIND,
  type CreatorProgram,
  type CreatorProfile,
} from "@/lib/services/creator-service";

function programFlagOf(profile: CreatorProfile, program: CreatorProgram): boolean {
  return program === "video" ? profile.videoActive
    : program === "voice" ? profile.voiceActive
    : program === "services" ? profile.servicesActive
    : program === "articles" ? profile.articlesActive
    : program === "courses" ? profile.coursesActive
    : profile.templatesActive;
}

interface Props {
  profile: CreatorProfile;
  onProfileChange: (next: CreatorProfile | null) => void;
}

// Enable/disable creator programs (Video Promo, Voice Clone, Services,
// Articles, Courses). Each program has its own legal terms — accepted on
// enable.
export default function YourProgramsPanel({ profile, onProfileChange }: Props) {
  const { toast } = useToast();
  const [programLoading, setProgramLoading] = useState<CreatorProgram | null>(null);

  const enableProgram = async (p: CreatorProgram) => {
    setProgramLoading(p);
    try {
      const doc = await legalService.getCurrent(CREATOR_PROGRAM_TERMS_KIND[p]);
      if (doc) await legalService.accept(doc.id, "program_enable");
      const updated = await creatorService.enableProgram(p);
      onProfileChange(updated);
      toast({ title: "Enabled", description: `${CREATOR_PROGRAM_LABEL[p]} program is now active.` });
    } catch (e: unknown) {
      toast({ title: "Enable failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setProgramLoading(null);
    }
  };

  const disableProgram = async (p: CreatorProgram) => {
    setProgramLoading(p);
    try {
      const updated = await creatorService.disableProgram(p);
      onProfileChange(updated);
      toast({ title: "Disabled", description: `${CREATOR_PROGRAM_LABEL[p]} program turned off.` });
    } catch (e: unknown) {
      toast({ title: "Disable failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setProgramLoading(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Your programs</h2>
          <p className="text-sm text-muted-foreground">
            Enable or disable programs independently. Each has its own terms.
          </p>
        </div>
        <Button variant="outline" asChild size="sm" className="w-full">
          <Link to={`/people/${profile.userId}`}>
            View public profile <ExternalLink className="h-4 w-4 ml-1" />
          </Link>
        </Button>
        <div className="grid grid-cols-1 gap-3">
          {CREATOR_PROGRAMS.map((p) => {
            const Icon = CREATOR_PROGRAM_ICON[p];
            const isOn = programFlagOf(profile, p);
            const isLoading = programLoading === p;
            return (
              <div
                key={p}
                className={`rounded-lg border p-3 ${isOn ? "border-emerald-300/50 bg-emerald-500/5" : "border-border"}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center ${isOn ? "bg-emerald-500 text-white" : "bg-muted"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="font-medium text-sm flex-1">{CREATOR_PROGRAM_LABEL[p]}</div>
                  {isOn && <Badge variant="default" className="bg-emerald-600 text-[10px] px-1.5 py-0">Active</Badge>}
                </div>
                {isOn && (
                  <Button asChild size="sm" className="w-full mb-1.5">
                    <Link to={CREATOR_PROGRAM_HOME[p]}>
                      Manage <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={isOn ? "outline" : "default"}
                  className="w-full"
                  onClick={() => isOn ? disableProgram(p) : enableProgram(p)}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : isOn ? <X className="h-3 w-3 mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                  {isOn ? "Disable" : "Enable"}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
