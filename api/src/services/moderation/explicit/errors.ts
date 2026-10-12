import { AppError } from "../../../middleware/errorHandler.js";
import type { ExplicitCategory } from "../../../../../shared/moderation/explicit.js";

/**
 * Thrown when a save / upload is blocked by the explicit scan. An AppError,
 * so the global handler answers 422 EXPLICIT_CONTENT. The message names the
 * categories, never the offending content.
 */
export class ExplicitContentError extends AppError {
  readonly categories: ExplicitCategory[];
  /** Sent as `error.details` — the client renders localized category names
   *  from these ids instead of this English message. */
  readonly details: { categories: ExplicitCategory[]; subject: "text" | "image" };
  constructor(categories: ExplicitCategory[], what: "text" | "image" = "text") {
    const list = categories.length ? categories.join(", ") : "explicit content";
    super(
      "EXPLICIT_CONTENT",
      what === "image"
        ? `This image can't be uploaded because it looks like it contains ${list}. Please choose another image.`
        : `This can't be saved because it looks like it contains ${list}. Please remove it and try again.`,
      422,
    );
    this.name = "ExplicitContentError";
    this.categories = categories;
    this.details = { categories, subject: what };
  }
}
