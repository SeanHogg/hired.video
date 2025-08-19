import {
  Users,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  MessageCircle,
  UserPlus,
  Network,
  CheckCircle2,
  Play,
  Globe,
  Handshake,
  TrendingUp,
  Search,
  Filter,
  X,
  Eye,
  UserCheck,
  Clock,
  Building2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Pagination, { usePagination } from "@/components/Pagination";
import PeopleCard from "@/components/PeopleCard";
import type { SearchFilters } from "@/components/SearchBar";
import SearchBar from "@/components/SearchBar";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { userService, type UserFilters, type PublicUser } from "@/lib/services/user-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import type { UserWithOwnership, UserProfile, UserMetadata } from "@/types/people";
import { ConnectionStatus } from "@/types/people";


// Type for the people data structure
type PeopleData =
  | { tracked: UserWithOwnership[] } // Authenticated user data
  | (UserProfile & {
      // Unauthenticated user data (transformed UserProfile)
      fullName: string;
      location: string;
      experienceLevel: string;
      currentPosition?: string;
      currentCompany?: string;
    })[];

export default function People() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPeople, setTotalPeople] = useState<number>(0);

  // Pagination logic
  const {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    handleTotalItemsChange,
  } = usePagination(totalPeople, 9);

  // Fetch people data
  const fetchPeople = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const filters: UserFilters = {
        search: searchFilters.search || undefined,
        role: searchFilters.role || undefined,
        location: searchFilters.location || undefined,
        skills: searchFilters.skills
          ? searchFilters.skills.split(",").map((s) => s.trim())
          : undefined,
        openToWork: searchFilters.openToWork || undefined,
        page: currentPage,
        limit: itemsPerPage,
      };

      const result = await userService.getPublicUsers(filters);
      // Filter out current user if authenticated
      const filteredPeople = result.items.filter(person => person.id !== user?.id);

      setPeople(filteredPeople);
      setTotalPeople(result.total - (user ? 1 : 0)); // Subtract 1 if current user was in results
      handleTotalItemsChange(result.total - (user ? 1 : 0));
    } catch (err) {
      console.error("Failed to fetch people:", err);
      setError("Failed to load people. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch people when filters or page changes
  useEffect(() => {
    fetchPeople();
  }, [searchFilters, currentPage, itemsPerPage]);

  // Get people based on user role and authentication
  const getPeopleForUser = () => {
    if (!user) {
      return people.map((person) => ({
        ...person,
        fullName: person.fullName || '',
        location: person.location || '',
        experienceLevel: 'Entry Level', // TODO: Calculate from API data when available
        currentPosition: person.currentRole || '',
        currentCompany: person.currentCompany || '',
      }));
    }

    const { tracked } = getAllPeopleForUser(user.id);
    const trackedWithOwnership: UserWithOwnership[] = tracked.map((person) => ({
      id: person.id,
      slug: person.slug,
      firstName: person.fullName?.split(' ')[0] || '',
      lastName: person.fullName?.split(' ').slice(1).join(' ') || '',
      fullName: person.fullName || '',
      avatar: person.avatar,
      headline: person.headline,
      location: person.location || '',
      role: person.role,
      visibility: 'public', // Default for tracked users
      status: 'active', // Default status
      companyId: '', // Not available in UserMetadataDTO
      companyName: person.currentCompany || '',
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
      lastActiveAt: new Date(), // Default to now
      profileViews: person.profileViews || 0,
      connectionCount: 0, // Not available in UserMetadataDTO
      followerCount: 0, // Not available in UserMetadataDTO
      isVerified: person.isVerified || false,
      isPremium: person.isPremium || false,
      openToWork: person.openToWork || false,
      experienceLevel: getExperienceLevel(person),
      currentPosition: getCurrentPosition(person),
      currentCompany: person.currentCompany || '',
      ownership: "tracked" as const,
    }));

    return { tracked: trackedWithOwnership };
  };

  // Get user-specific people data (tracked people)
  const getAllPeopleForUser = (userId: string) => {
    // TODO: Replace with actual API calls when backend supports user people associations
    // For now, return empty arrays as placeholder
    return {
      tracked: [] as PublicUser[]
    };
  };

  // Helper functions
  const getExperienceLevel = (person: any): string => {
    // TODO: Calculate experience level from API data when detailed experience is available
    // For now, return a default based on role or use a simple heuristic
    if (person.currentRole?.toLowerCase().includes('senior')) return "Senior Level";
    if (person.currentRole?.toLowerCase().includes('lead') || person.currentRole?.toLowerCase().includes('manager')) return "Senior Level";
    if (person.currentRole?.toLowerCase().includes('junior')) return "Entry Level";
    return "Mid Level"; // Default fallback
  };

  const getCurrentPosition = (person: any): string | undefined => {
    // Use the currentRole and currentCompany from UserMetadataDTO
    if (person.currentRole && person.currentCompany) {
      return `${person.currentRole} at ${person.currentCompany}`;
    }
    return person.currentRole || undefined;
  };

  const getCompanyNameByUser = (person: UserProfile): string | undefined => {
    const companyMap: { [key: string]: string } = {
      "techcorp-inc": "TechCorp Inc.",
      "growth-dynamics": "Growth Dynamics",
      "cloudscale-solutions": "CloudScale Solutions",
    };
    return person.companyId ? companyMap[person.companyId] : undefined;
  };

  const handleTrackPerson = (personId: string) => {
    if (user) {
      addTrackedPerson(personId, user.id);
      // In a real app, you'd trigger a re-render here
    }
  };

  const handleUntrackPerson = (personId: string) => {
    if (user) {
      removeTrackedPerson(personId, user.id);
      // In a real app, you'd trigger a re-render here
    }
  };



  const handleConnect = async (personId: string) => {
    if (user) {
      try {
        await userService.sendConnectionRequest({ toUserId: personId });
        // Refresh people to show updated connection status
        await fetchPeople();
      } catch (error) {
        console.error("Failed to send connection request:", error);
      }
    }
  };

  const handleAcceptConnection = async (connectionId: string) => {
    if (user) {
      try {
        await userService.acceptConnectionRequest(connectionId);
        // Refresh people to show updated connection status
        await fetchPeople();
      } catch (error) {
        console.error("Failed to accept connection request:", error);
      }
    }
  };

  const handleRejectConnection = async (connectionId: string) => {
    if (user) {
      try {
        await userService.rejectConnectionRequest(connectionId);
        // Refresh people to show updated connection status
        await fetchPeople();
      } catch (error) {
        console.error("Failed to reject connection request:", error);
      }
    }
  };

  const handleMessage = (personId: string) => {
    // Navigate to messaging or open message modal
    console.log("Message person:", personId);
  };

  const handleSearch = (query: string) => {
    setSearchFilters((prev) => ({ ...prev, search: query }));
  };

  const handleFilterChange = (filters: SearchFilters) => {
    setSearchFilters(filters);
  };

  const handleClearFilters = () => {
    setSearchFilters({});
  };

  // If user is authenticated, show the actual people page
  if (isAuthenticated && user) {
    const peopleData: PeopleData = getPeopleForUser();
    const isJobSeeker = user.role === "job_seeker";
    const isRecruiterOrBusiness =
      user.role === "recruiter" || user.role === "business";

    return (
      <div className="min-h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />

          <div className="pt-16 p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-bold mb-2">
                    Professional Network
                  </h1>
                  <p className="text-muted-foreground">
                    {isJobSeeker
                      ? "Connect with recruiters, industry leaders, and fellow professionals"
                      : "Discover and connect with talented professionals"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline">
                    <Link to="/profile">
                      <UserCheck className="h-4 w-4 mr-2" />
                      My Profile
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Search and Filters */}
              <div className="mb-6">
                <SearchBar
                  context="people"
                  value={searchFilters.search}
                  filters={searchFilters}
                  onSearch={handleSearch}
                  onFilterChange={handleFilterChange}
                  onClearFilters={handleClearFilters}
                />
              </div>

              {/* People Listings */}
              <div className="space-y-6">
                {/* Tracked People */}
                {("tracked" in peopleData
                  ? peopleData.tracked.length > 0
                  : false) && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Following (
                      {"tracked" in peopleData ? peopleData.tracked.length : 0})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {("tracked" in peopleData ? peopleData.tracked : []).map(
                        (person: UserWithOwnership) => (
                          <PeopleCard
                            key={person.id}
                            person={person}
                            connectionStatus={
                              user
                                ? getConnectionStatus(user.id, person.id)
                                : "none"
                            }
                            showOwnership
                            onTrack={handleTrackPerson}
                            onUntrack={handleUntrackPerson}
                            onConnect={handleConnect}
                            onMessage={handleMessage}
                            onAcceptConnection={handleAcceptConnection}
                            onRejectConnection={handleRejectConnection}
                          />
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* Discover People */}
                <div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Discover Professionals
                  </h2>
                  {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="animate-pulse">
                          <div className="bg-gray-200 rounded-lg h-48"></div>
                        </div>
                      ))}
                    </div>
                  ) : error ? (
                    <div className="text-center py-12">
                      <p className="text-red-600 mb-4">{error}</p>
                      <Button onClick={fetchPeople}>Try Again</Button>
                    </div>
                  ) : people.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-600 mb-4">No people found matching your criteria.</p>
                      <Button onClick={() => setSearchFilters({})}>Clear Filters</Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {people.map((person) => {
                        const personMetadata = {
                          id: person.id,
                          firstName: person.firstName,
                          lastName: person.lastName,
                          fullName: `${person.firstName} ${person.lastName}`,
                          avatar: person.profilePicture,
                          bio: person.bio,
                          location: person.location || "Location not specified",
                          role: person.role,
                          skills: person.skills,
                          openToWork: person.openToWork,
                          slug: person.slug,
                          createdAt: person.createdAt,
                          updatedAt: person.updatedAt,
                        };

                        return (
                          <PeopleCard
                            key={person.id}
                            person={personMetadata}
                            connectionStatus="none" // TODO: Implement connection status checking
                            onConnect={handleConnect}
                            onMessage={handleMessage}
                            onAcceptConnection={handleAcceptConnection}
                            onRejectConnection={handleRejectConnection}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Pagination */}
                  {!isLoading && !error && people.length > 0 && (
                    <Pagination
                      currentPage={currentPage}
                      totalItems={totalPeople}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      onItemsPerPageChange={handleItemsPerPageChange}
                    />
                  )}
                </div>

                {/* Empty State */}
                {("tracked" in peopleData
                  ? peopleData.tracked.length === 0
                  : true) && (
                  <div className="text-center py-12">
                    <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold mb-2">
                      Start Building Your Network
                    </h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Connect with professionals in your industry to expand your
                      network and discover new opportunities.
                    </p>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        💡 <strong>Tip:</strong> Use the search and filters
                        above to find people with specific skills or roles!
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  // If user is not authenticated, show marketing page
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16">
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Users className="h-12 w-12 text-primary" />
                  <Network className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Professional Network
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                Connect. Collaborate. Grow Together.
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Build meaningful professional relationships with job seekers,
                recruiters, and industry leaders. Expand your network and unlock
                new opportunities through authentic connections.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Join the Network
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="text-lg px-8">
                  <Play className="mr-2 h-5 w-5" />
                  Explore Profiles
                </Button>
              </div>
            </div>

            {/* Stats Section */}
            <div className="grid md:grid-cols-4 gap-6 mb-16">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">
                  250K+
                </div>
                <p className="text-sm text-muted-foreground">
                  Active professionals
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">15K+</div>
                <p className="text-sm text-muted-foreground">
                  Daily connections made
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">89%</div>
                <p className="text-sm text-muted-foreground">Response rate</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">50+</div>
                <p className="text-sm text-muted-foreground">
                  Countries represented
                </p>
              </div>
            </div>

            {/* Featured Professionals using PeopleCard */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Meet Our Community
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                {people
                  .slice(0, 3)
                  .map((person) => {
                    const personMetadata = {
                      id: person.id || '',
                      slug: person.slug || '',
                      firstName: person.fullName?.split(' ')[0] || '',
                      lastName: person.fullName?.split(' ').slice(1).join(' ') || '',
                      fullName: person.fullName || '',
                      avatar: person.avatar,
                      headline: person.headline,
                      location: person.location || '',
                      role: person.role || 0,
                      visibility: 'public' as const, // Default for public users
                      status: 'active' as const, // Default status
                      companyId: '', // Not available in PublicUser
                      companyName: person.currentCompany || '',
                      createdAt: person.createdAt || '',
                      updatedAt: person.updatedAt || '',
                      lastActiveAt: person.updatedAt || '', // Use updatedAt as fallback
                      profileViews: person.profileViews || 0,
                      connectionCount: 0, // Not available in PublicUser
                      followerCount: 0, // Not available in PublicUser
                      isVerified: person.isVerified || false,
                      isPremium: person.isPremium || false,
                      openToWork: person.openToWork || false,
                      experienceLevel: getExperienceLevel(person),
                      currentPosition: getCurrentPosition(person),
                      currentCompany: person.currentCompany || '',
                    };

                    return (
                      <PeopleCard key={person.id} person={personMetadata} />
                    );
                  })}
              </div>
              <div className="text-center mt-8">
                <Link to="/signup">
                  <Button variant="outline" size="lg">
                    View All Professionals
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Features and How It Works sections remain the same */}
            {/* ... (keeping the existing marketing content) ... */}

            {/* Final CTA */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">
                Ready to Expand Your Professional Network?
              </h3>
              <p className="text-muted-foreground mb-6">
                Join thousands of professionals who are building meaningful
                connections and advancing their careers.
              </p>
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  Start Networking Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}


