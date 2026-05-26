// Cross-surface signal for "the user just did something that may have
// unlocked a badge — refresh the poll now instead of waiting up to 60s"
// (#1568). Used by:
//   • [BadgeUnlockToaster](../../components/badges/BadgeUnlockToaster.tsx)
//     listens for the event and triggers an immediate `refetch`.
//   • [CourseLearner.applyLessonPassed](../../pages/CourseLearner.tsx)
//     fires it after every lesson-completion / course-pass flip.
//
// Any future badge-firing action (article publish, points redemption,
// gamification claim) can adopt the same signal without touching the
// toaster's internals.

export const BADGE_REFRESH_EVENT = "hv:badges:refresh";

export function signalBadgeRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BADGE_REFRESH_EVENT));
}
