import React from "react";
import { Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface UpcomingInterview {
  id: string;
  jobTitle: string;
  company: string;
  scheduledTime?: Date;
  type: string;
  status: string;
  notes?: string;
}

interface UpcomingInterviewsCardProps {
  interviews?: UpcomingInterview[];
  loading?: boolean;
  maxItems?: number;
}

export function UpcomingInterviewsCard({ interviews, loading = false, maxItems = 4 }: UpcomingInterviewsCardProps) {
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
              <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
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
                  <div className="font-medium text-sm">{interview.jobTitle}</div>
                  <div className="text-xs text-muted-foreground">{interview.company}</div>
                  <div className="text-xs text-blue-600">{interview.type}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium">
                    {new Date(interview.scheduledTime).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(interview.scheduledTime).toLocaleTimeString()}
                  </div>
                  <Badge variant="secondary" className="text-xs mt-1">
                    {interview.status}
                  </Badge>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full">
              View All Interviews
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming interviews</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default UpcomingInterviewsCard;
