import { publicResumePath } from "@shared/public-paths";
import BaseCard from "@/components/ui/BaseCard";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import ResumeCardContent from "@/components/resumes/card/ResumeCardContent";
import ResumeCardFooter from "@/components/resumes/card/ResumeCardFooter";
import { useResumeCardModel } from "@/components/resumes/card/use-resume-card-model";
import type { ResumeCardProps } from "@/components/resumes/card/types";

export type { ResumeCardProps } from "@/components/resumes/card/types";

export default function ResumeCard(props: ResumeCardProps) {
  const {
    id,
    slug,
    userId,
    name,
    title,
    summary,
    createdAt,
    views = 0,
    scores,
    sentimentScore,
    isMaster = false,
    isActive = false,
    parentId,
    parentName,
    variations,
    ownership,
    onClone,
    isArchived = false,
    onScoreClick,
    extraMenuItems,
  } = props;
  const {
    isOwner,
    canViewStats,
    badges,
    hasChildren,
    canCreateVariation,
    hasIndividualHandlers,
    cardActions,
    handleCloneResume,
  } = useResumeCardModel(props);

  return (
    <BaseCard className="flex flex-col h-full">
      <CardHeaderWithAvatar
        title={name}
        subtitle={title}
        avatar={{
          src: undefined, // Resumes don't typically have avatars
          fallback: "R",
          size: "md",
        }}
        badges={badges}
        linkTo={publicResumePath(id)}
      />

      <ResumeCardContent
        id={id}
        userId={userId}
        slug={slug}
        summary={summary}
        createdAt={createdAt}
        views={views}
        scores={scores}
        sentimentScore={sentimentScore}
        parentId={parentId}
        parentName={parentName}
        variations={variations}
        hasChildren={hasChildren}
        isOwner={isOwner}
        canViewStats={canViewStats}
        onScoreClick={onScoreClick}
      />

      {hasIndividualHandlers ? (
        <ResumeCardFooter
          {...props}
          ownership={ownership}
          isOwner={isOwner}
          isActive={isActive}
          isMaster={isMaster}
          isArchived={isArchived}
          canCreateVariation={canCreateVariation}
          onClone={isOwner ? (onClone ?? handleCloneResume) : undefined}
        />
      ) : (
        <CardActions actions={cardActions} extraMenuItems={extraMenuItems} />
      )}
    </BaseCard>
  );
}
