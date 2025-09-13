import React, { useState } from "react";
import { ChevronDown, ChevronRight, Star, Eye, Plus, MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import type { MasterResumeGroup } from "@/lib/services/resume-service";

interface MasterResumeGroupProps {
  group: MasterResumeGroup;
  userRole?: string;
  isOwned: boolean;
  onViewResume: (resumeId: string) => void;
  onCreateVariation: (masterResumeId: string) => void;
  onSetActive: (resumeId: string) => void;
  onEditResume: (resumeId: string) => void;
  onDeleteResume: (resumeId: string) => void;
  onTrackResume?: (resumeId: string) => void;
}

export default function MasterResumeGroupComponent({
  group,
  userRole = "JobSeeker",
  isOwned,
  onViewResume,
  onCreateVariation,
  onSetActive,
  onEditResume,
  onDeleteResume,
  onTrackResume,
}: MasterResumeGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleToggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const getPrivacyBadgeColor = (privacy: string) => {
    switch (privacy) {
      case "public":
        return "bg-green-100 text-green-800";
      case "recruiter_only":
        return "bg-blue-100 text-blue-800";
      case "private":
        return "bg-gray-100 text-gray-800";
      case "draft":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPrivacyLabel = (privacy: string) => {
    switch (privacy) {
      case "public":
        return "Public";
      case "recruiter_only":
        return "Recruiters Only";
      case "private":
        return "Private";
      case "draft":
        return "Draft";
      default:
        return "Private";
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleExpanded}
              className="p-1 h-6 w-6"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <div className="flex items-center space-x-2">
              <Star className="h-5 w-5 text-yellow-500 fill-current" />
              <CardTitle className="text-lg">
                <Link
                  to={`/resumes/${group.masterResume.id}`}
                  className="hover:text-primary transition-colors"
                >
                  {group.masterResume.name}
                </Link>
              </CardTitle>
              {group.masterResume.isActive && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Active
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className={getPrivacyBadgeColor(group.masterResume.privacy as string)}>
              {getPrivacyLabel(group.masterResume.privacy as string)}
            </Badge>
            <div className="flex items-center text-sm text-muted-foreground">
              <Eye className="h-4 w-4 mr-1" />
              {group.masterResume.views}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onViewResume(group.masterResume.id)}>
                  View Resume
                </DropdownMenuItem>

                {/* Owner-only actions */}
                {isOwned && (userRole === "JobSeeker" || userRole === "Recruiter") && (
                  <>
                    <DropdownMenuItem onClick={() => onEditResume(group.masterResume.id)}>
                      Edit Resume
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCreateVariation(group.masterResume.id)}>
                      Create Variation
                    </DropdownMenuItem>
                    {!group.masterResume.isActive && (
                      <DropdownMenuItem onClick={() => onSetActive(group.masterResume.id)}>
                        Set as Active
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => onDeleteResume(group.masterResume.id)}
                      className="text-red-600"
                    >
                      Delete Resume
                    </DropdownMenuItem>
                  </>
                )}

                {/* Non-owner actions (tracking) */}
                {!isOwned && onTrackResume && (
                  <DropdownMenuItem onClick={() => onTrackResume(group.masterResume.id)}>
                    Track Resume
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="ml-9 text-sm text-muted-foreground">
          Master Resume • Created {formatDate(group.masterResume.createdAt)} • {group.variations.length} variation{group.variations.length !== 1 ? 's' : ''}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {/* Master Resume Summary */}
          <div className="ml-9 mb-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground line-clamp-2">
              {(group.masterResume.data as { Basics?: { Summary?: string } })?.Basics?.Summary || "No summary available"}
            </p>
          </div>

          {/* Variations */}
          {group.variations.length > 0 && (
            <div className="ml-9 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground">Variations</h4>
                {isOwned && (userRole === "JobSeeker" || userRole === "Recruiter") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCreateVariation(group.masterResume.id)}
                    className="h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Variation
                  </Button>
                )}
              </div>
              
              {group.variations.map((variation) => (
                <div
                  key={variation.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h5 className="font-medium">
                        <Link
                          to={`/resumes/${variation.id}`}
                          className="hover:text-primary transition-colors"
                        >
                          {variation.name}
                        </Link>
                      </h5>
                      {variation.isActive && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                          Active
                        </Badge>
                      )}
                      <Badge className={`${getPrivacyBadgeColor(variation.privacy as string)} text-xs`}>
                        {getPrivacyLabel(variation.privacy as string)}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-4 mt-1 text-xs text-muted-foreground">
                      <span>Created {formatDate(variation.createdAt)}</span>
                      <div className="flex items-center">
                        <Eye className="h-3 w-3 mr-1" />
                        {variation.views}
                      </div>
                    </div>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewResume(variation.id)}>
                        View Resume
                      </DropdownMenuItem>

                      {/* Owner-only actions */}
                      {isOwned && (userRole === "JobSeeker" || userRole === "Recruiter") && (
                        <>
                          <DropdownMenuItem onClick={() => onEditResume(variation.id)}>
                            Edit Resume
                          </DropdownMenuItem>
                          {!variation.isActive && (
                            <DropdownMenuItem onClick={() => onSetActive(variation.id)}>
                              Set as Active
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => onDeleteResume(variation.id)}
                            className="text-red-600"
                          >
                            Delete Variation
                          </DropdownMenuItem>
                        </>
                      )}

                      {/* Non-owner actions (tracking) */}
                      {!isOwned && onTrackResume && (
                        <DropdownMenuItem onClick={() => onTrackResume(variation.id)}>
                          Track Resume
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}

          {/* No Variations State */}
          {group.variations.length === 0 && (
            <div className="ml-9 text-center py-6 border-2 border-dashed border-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">
                {isOwned ? "No variations yet" : "This resume has no variations"}
              </p>
              {isOwned && (userRole === "JobSeeker" || userRole === "Recruiter") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCreateVariation(group.masterResume.id)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Variation
                </Button>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
