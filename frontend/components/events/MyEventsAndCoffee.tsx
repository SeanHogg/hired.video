/**
 * MyEventsAndCoffee — stacked "what's mine" surface for /tasks.
 *
 * Combines hosted/attending events (MyEventsTab) and pending coffee
 * invites (CoffeeTab) into one tab so users see all their networking
 * commitments without bouncing between surfaces.
 *
 * The two child components stay as discrete units — each owns its own
 * fetch + state — and this wrapper is purely layout. New "mine" panels
 * (e.g. upcoming RSVPs reminders, host announcements) should be added
 * here alongside.
 */
import { MyEventsTab } from "@/components/events/MyEventsTab";
import { CoffeeTab } from "@/components/events/CoffeeTab";

export function MyEventsAndCoffee({ viewerUserId }: { viewerUserId: string }) {
  return (
    <div className="space-y-10">
      <MyEventsTab />

      <section>
        <h2 className="text-lg font-semibold mb-3">Coffee invites</h2>
        <CoffeeTab viewerUserId={viewerUserId} />
      </section>
    </div>
  );
}
