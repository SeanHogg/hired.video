import React from "react";
import { Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ScheduledInterview {
  id: string;
  candidateName: string;
  jobTitle: string;
  date: string;
  time: string;
  type: string;
  status: string;
}

interface ScheduledInterviewsCardProps {
  interviews?: ScheduledInterview[];
  loading?: boolean;
  maxItems?: number;
}

export function ScheduledInterviewsCard({ interviews, loading = false, maxItems = 5 }: ScheduledInterviewsCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming Interviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Upcoming Interviews
        </CardTitle>
      </CardHeader>
      <CardContent>
        {interviews && interviews.length > 0 ? (
          <div className="space-y-3">
            {interviews.slice(0, maxItems).map((interview, index) => (
              <div
                key={interview.id || index}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div>
                  <div className="font-medium text-sm">
                    {interview.candidateName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {interview.jobTitle}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium">{interview.date}</div>
                  <div className="text-xs text-muted-foreground">
                    {interview.time}
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full">
              View All Interviews
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No scheduled interviews
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ScheduledInterviewsCard;
