import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Lightbulb,
  Mic,
  MessageSquareText,
  UserRound,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";

export default function VideoBestPractices() {
  const location = useLocation();  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Help & Support", url: "/help" },
    { name: "Video Resume Best Practices", url: "/guides/video-best-practices" },
  ]);
  const { isAuthenticated } = useAuth();

  return (
    <AppShell bgClassName="bg-background">
<div className="p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            <Link to="/help" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Back to Help & Support
            </Link>

            <div>
              <h1 className="text-3xl font-bold tracking-tight">Video Resume Best Practices</h1>
              <p className="text-muted-foreground mt-2">
                Stand out to recruiters with a polished, professional video resume. Follow these tips to make the best impression.
              </p>
            </div>

            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    Keep It Short
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Aim for 60-90 seconds. Recruiters review hundreds of applications, so respect their time by getting to the point quickly. Front-load your strongest selling points in the first 15 seconds to hook their attention before they move on.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-primary" />
                    Lighting & Background
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Position yourself facing a window or soft light source so your face is evenly lit without harsh shadows. Choose a clean, uncluttered background that won't distract from what you're saying. Avoid sitting with a bright window behind you, as backlighting turns you into a silhouette.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mic className="h-5 w-5 text-primary" />
                    Audio Quality
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Record in a quiet room away from traffic, AC hum, and other background noise. A simple lapel mic or USB microphone dramatically improves clarity over your laptop's built-in mic. Always do a short test recording and listen back before committing to a full take.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquareText className="h-5 w-5 text-primary" />
                    What to Say
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Open with your name and current role or area of expertise to immediately set context. Highlight two or three key achievements with specific results (numbers, impact, scale) rather than listing generic responsibilities. Close by clearly stating the type of role or opportunity you're looking for so recruiters can match you quickly.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserRound className="h-5 w-5 text-primary" />
                    Body Language
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Look directly at the camera lens, not at your own image on screen, to create genuine eye contact with the viewer. Sit up straight and smile naturally to project confidence and approachability. Use hand gestures sparingly to emphasize key points without becoming distracting.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Use Our AI Tools
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    The hired.video Studio offers AI voiceover with text-to-speech so you can generate a professional narration even if you're camera-shy. Use the built-in teleprompter to stay on script without memorizing, and start from one of our templates to structure your message. These tools help you produce a polished video in a fraction of the time.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-primary" />
                    Review & Iterate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Watch your video all the way through before publishing and pay attention to pacing, filler words, and energy level. Share it with a trusted friend or mentor and ask for honest feedback on clarity and impression. Don't be afraid to re-record — most great video resumes take two or three attempts to get right.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" asChild>
                <Link to="/guides/getting-started" className="inline-flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" /> Previous: Getting Started
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/guides/networking" className="inline-flex items-center gap-2">
                  Next: Networking Tips <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
</AppShell>
  );
}
