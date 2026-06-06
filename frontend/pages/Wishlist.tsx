// My Wishlist — the saved-items surface backed by the caller's canonical
// wishlist list. Courses today; as more entity types gain a heart this page
// grows a tab per type. Heart toggles anywhere on the app keep this in sync
// via the shared react-query cache (see useWishlist).

import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { Heart, Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import CourseMarketplaceCard from "@/components/CourseMarketplaceCard";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { listsService } from "@/lib/services/lists-service";

export default function Wishlist() {
  useSEO("/wishlist");
  useBreadcrumbs([{ name: "Wishlist", url: "/wishlist" }]);
  const { isAuthenticated } = useAuth();

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["wishlist", "courses"],
    queryFn: () => listsService.wishlistCourses(),
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return <Navigate to="/login?returnTo=/wishlist" replace />;
  }

  return (
    <AppShell>
      <main className="px-4 sm:px-6 lg:px-8 py-10 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Heart className="h-6 w-6 fill-rose-500 text-rose-500" />
          <h1 className="text-2xl font-bold tracking-tight">My Wishlist</h1>
        </div>
        <p className="text-muted-foreground mb-8">
          Courses you've saved to come back to.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20 border rounded-xl bg-muted/20">
            <Heart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-4" />
            <h2 className="font-semibold mb-1">Nothing saved yet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Tap the heart on any course to save it here.
            </p>
            <Button asChild>
              <Link to="/search?category=courses">Browse courses</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map((course) => (
              <CourseMarketplaceCard key={course.id} item={course} />
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
