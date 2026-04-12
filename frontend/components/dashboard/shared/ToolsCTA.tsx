import React from "react";
import {
  Wrench,
  Mic,
  Brain,
  FileText,
  Target,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ToolsCTAProps {
  variant?: "banner" | "compact";
}

const TOOL_LINKS = [
  { to: "/interview", icon: Mic, label: "Interview Practice", short: "Interview" },
  { to: "/chat", icon: Brain, label: "AI Coach", short: "AI Coach" },
  { to: "/tools/resume-tailor", icon: FileText, label: "Resume Tailor", short: "Tailor" },
  { to: "/tools/ai-resume-scorer", icon: Target, label: "Resume Scorer", short: "Scorer" },
];

export function ToolsCTA({ variant = "banner" }: ToolsCTAProps) {
  if (variant === "compact") {
    return (
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 via-white to-blue-50">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-purple-100 flex items-center justify-center shrink-0">
              <Wrench className="h-4 w-4 text-purple-600" />
            </div>
            <CardTitle className="text-sm font-semibold">Sharpen Your Edge</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {TOOL_LINKS.map(({ to, icon: Icon, short }) => (
              <Link key={to} to={to}>
                <Badge variant="secondary" className="cursor-pointer hover:bg-purple-100 text-xs">
                  <Icon className="h-3 w-3 mr-1" /> {short}
                </Badge>
              </Link>
            ))}
          </div>
          <Link to="/tools">
            <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-700 text-xs h-8">
              Explore All Tools
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-purple-200 bg-gradient-to-r from-purple-50 via-white to-blue-50">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
              <Wrench className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg">Sharpen Your Edge with Tools</h3>
                <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">New</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Interview practice, AI career coach, resume scoring, tailoring, salary calculator, and more —
                all in one place.
              </p>
              <div className="flex flex-wrap gap-2">
                {TOOL_LINKS.map(({ to, icon: Icon, label }) => (
                  <Link key={to} to={to}>
                    <Badge variant="secondary" className="cursor-pointer hover:bg-purple-100">
                      <Icon className="h-3 w-3 mr-1" /> {label}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <Link to="/tools" className="shrink-0">
            <Button className="bg-purple-600 hover:bg-purple-700 w-full lg:w-auto">
              Explore All Tools
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default ToolsCTA;
