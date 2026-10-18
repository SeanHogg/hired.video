/** Bookings reservation comment threads with author-kind gating. */

import type {
  AddCommentInput,
  BookingAuthorKind,
  BookingCommentDTO,
} from "../../../../shared/bookings.js";
import type { IBookingCommentStore } from "../../repositories/bookingsRepository.js";
import { resolveActorReservation, type ActorReservationDeps } from "./actor.js";

export interface CommentsDeps {
  repo: ActorReservationDeps["repo"] & IBookingCommentStore;
}

export async function listComments(
  deps: CommentsDeps,
  args: {
    actor: BookingAuthorKind;
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
  },
): Promise<BookingCommentDTO[]> {
  const { row, host } = await resolveActorReservation(deps, args);
  const rows = await deps.repo.listCommentsForReservation(row.id);
  return rows.map((c) => ({
    id: c.id,
    reservationId: c.reservationId,
    authorKind: c.authorKind as BookingAuthorKind,
    authorDisplayName: c.authorKind === "host" ? host.displayName : row.bookerName,
    bodyMd: c.bodyMd,
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function addComment(
  deps: CommentsDeps,
  args: {
    actor: BookingAuthorKind;
    actorUserId?: string;
    magicLinkToken?: string;
    reservationId?: string;
    input: AddCommentInput;
  },
): Promise<BookingCommentDTO> {
  const { row, host } = await resolveActorReservation(deps, args);
  const c = await deps.repo.insertComment({
    reservationId: row.id,
    authorKind: args.actor,
    authorUserId: args.actor === "host" ? host.userId : null,
    bodyMd: args.input.bodyMd.trim(),
  });
  return {
    id: c.id,
    reservationId: c.reservationId,
    authorKind: c.authorKind as BookingAuthorKind,
    authorDisplayName: c.authorKind === "host" ? host.displayName : row.bookerName,
    bodyMd: c.bodyMd,
    createdAt: c.createdAt.toISOString(),
  };
}
