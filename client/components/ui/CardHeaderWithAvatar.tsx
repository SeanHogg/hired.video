import * as React from "react";
import { Link } from "react-router-dom";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BadgeConfig {
  text: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface AvatarConfig {
  src?: string;
  fallback: string;
  size?: "sm" | "md" | "lg";
}

interface CardHeaderWithAvatarProps {
  title: string;
  subtitle?: string;
  avatar?: AvatarConfig;
  badges?: BadgeConfig[];
  linkTo?: string;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  layout?: "horizontal" | "vertical";
}

/**
 * CardHeaderWithAvatar - Reusable card header component
 * 
 * Provides:
 * - Consistent avatar, title, subtitle layout
 * - Badge support with icons
 * - Link integration for titles
 * - Flexible horizontal/vertical layouts
 * - Responsive design with proper truncation
 */
export function CardHeaderWithAvatar({
  title,
  subtitle,
  avatar,
  badges = [],
  linkTo,
  className = "",
  titleClassName = "",
  subtitleClassName = "",
  layout = "horizontal"
}: CardHeaderWithAvatarProps) {
  const TitleComponent = linkTo ? Link : 'div';
  
  const avatarSizes = {
    sm: "w-8 h-8",
    md: "w-12 h-12", 
    lg: "w-16 h-16"
  };

  const avatarSize = avatar?.size || "md";

  return (
    <div className="p-6 pb-3">
      <div className="flex items-start justify-between">
        <div className={cn(
          "flex items-start gap-3 flex-1",
          layout === "vertical" && "flex-col items-center text-center"
        )}>
          {avatar && (
            <Avatar className={cn(avatarSizes[avatarSize], "flex-shrink-0")}>
              <AvatarImage src={avatar.src} alt={title} />
              <AvatarFallback className="text-sm">
                {avatar.fallback}
              </AvatarFallback>
            </Avatar>
          )}
          
          <div className={cn(
            "flex-1 min-w-0",
            layout === "vertical" && "w-full"
          )}>
            <div className={cn(
              "flex items-center gap-2 mb-1",
              layout === "vertical" && "flex-col gap-1"
            )}>
              <CardTitle
                className={cn(
                  "text-lg hover:text-primary leading-tight",
                  "w-full max-w-[280px] break-words", // Fixed width with word breaking
                  layout === "vertical" && "text-center",
                  titleClassName
                )}
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordWrap: 'break-word',
                  hyphens: 'auto'
                }}
              >
                {linkTo ? (
                  <TitleComponent to={linkTo} className="hover:text-primary">
                    {title}
                  </TitleComponent>
                ) : (
                  title
                )}
              </CardTitle>
              
              {badges.length > 0 && (
                <div className={cn(
                  "flex items-center gap-1 flex-wrap",
                  layout === "vertical" && "justify-center"
                )}>
                  {badges.map((badge, index) => (
                    <Badge
                      key={index}
                      variant={badge.variant || "outline"}
                      className={cn("text-xs flex-shrink-0", badge.className)}
                    >
                      {badge.icon && (
                        React.isValidElement(badge.icon)
                          ? badge.icon
                          : React.createElement(badge.icon as React.ComponentType<{ className?: string }>, { className: "h-3 w-3 mr-1" })
                      )}
                      {badge.text}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            {subtitle && (
              <CardDescription className={cn(
                "truncate",
                layout === "vertical" && "text-center",
                subtitleClassName
              )}>
                {subtitle}
              </CardDescription>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CardHeaderWithAvatar;
