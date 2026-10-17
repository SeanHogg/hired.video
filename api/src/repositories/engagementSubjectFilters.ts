/**
 * Subject predicates for the polymorphic `comments` / `reactions` tables
 * (W3-A). Every repository that reads or writes a surface's comments or
 * reactions scopes its query with these, so the (subject_type, subject_id)
 * pair is always matched together and `idx_comments_subject` /
 * `uq_reactions_subject_user` serve the lookup.
 */
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type {
  CommentSubjectType,
  ReactionSubjectType,
} from "../../../shared/engagement-subjects.js";

const { comments, reactions } = schema;

export function commentsOn(subjectType: CommentSubjectType, subjectId: string): SQL {
  return and(eq(comments.subjectType, subjectType), eq(comments.subjectId, subjectId)) as SQL;
}

export function commentsOnAny(subjectType: CommentSubjectType, subjectIds: string[]): SQL {
  return and(eq(comments.subjectType, subjectType), inArray(comments.subjectId, subjectIds)) as SQL;
}

export function reactionsOn(subjectType: ReactionSubjectType, subjectId: string): SQL {
  return and(eq(reactions.subjectType, subjectType), eq(reactions.subjectId, subjectId)) as SQL;
}

export function reactionsOnAny(subjectType: ReactionSubjectType, subjectIds: string[]): SQL {
  return and(eq(reactions.subjectType, subjectType), inArray(reactions.subjectId, subjectIds)) as SQL;
}

/** One user's reaction row on one subject (the unique key). */
export function reactionBy(subjectType: ReactionSubjectType, subjectId: string, userId: string): SQL {
  return and(reactionsOn(subjectType, subjectId), eq(reactions.userId, userId)) as SQL;
}
