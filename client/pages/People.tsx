import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { useSidebar } from "@/hooks/use-sidebar";
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
  Award,
  TrendingUp,
  Search,
  Filter,
} from "lucide-react";

export default function People() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
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
                  Build meaningful professional relationships with job seekers, recruiters, and industry leaders. Expand your network and unlock new opportunities through authentic connections.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
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
                  <div className="text-3xl font-bold text-primary mb-2">250K+</div>
                  <p className="text-sm text-muted-foreground">Active professionals</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">15K+</div>
                  <p className="text-sm text-muted-foreground">Daily connections made</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">89%</div>
                  <p className="text-sm text-muted-foreground">Response rate</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">50+</div>
                  <p className="text-sm text-muted-foreground">Countries represented</p>
                </div>
              </div>

              {/* Features Grid */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Why Professionals Choose Our Network</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                    <CardHeader>
                      <Video className="h-10 w-10 text-brand-purple mb-4" />
                      <CardTitle>Video Profiles</CardTitle>
                      <CardDescription>
                        Stand out with video introductions that showcase your personality and professional expertise beyond a traditional profile.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          30-second video intros
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Skill demonstration videos
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Professional storytelling
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                    <CardHeader>
                      <Search className="h-10 w-10 text-brand-blue mb-4" />
                      <CardTitle>Smart Networking</CardTitle>
                      <CardDescription>
                        Discover the right people to connect with using AI-powered recommendations based on your goals and interests.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          AI-powered matching
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Industry-specific filters
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Mutual connection insights
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                    <CardHeader>
                      <MessageCircle className="h-10 w-10 text-primary mb-4" />
                      <CardTitle>Meaningful Conversations</CardTitle>
                      <CardDescription>
                        Start authentic professional conversations with integrated messaging and collaboration tools.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          In-app messaging
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Video call integration
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Professional ice breakers
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Featured Professionals */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Meet Our Community</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 text-center">
                      <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-white font-bold text-xl">AS</span>
                      </div>
                      <h3 className="font-semibold text-lg mb-1">Alexandra Smith</h3>
                      <p className="text-sm text-muted-foreground mb-3">Senior Software Engineer at Google</p>
                      <Badge variant="outline" className="mb-3">JavaScript Expert</Badge>
                      <p className="text-xs text-muted-foreground mb-4">
                        "Passionate about mentoring junior developers and building scalable web applications."
                      </p>
                      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          1.2K connections
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          4.9 rating
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 text-center">
                      <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-white font-bold text-xl">MJ</span>
                      </div>
                      <h3 className="font-semibold text-lg mb-1">Marcus Johnson</h3>
                      <p className="text-sm text-muted-foreground mb-3">Head of Talent at Stripe</p>
                      <Badge variant="outline" className="mb-3">Top Recruiter</Badge>
                      <p className="text-xs text-muted-foreground mb-4">
                        "Helping connect amazing talent with incredible opportunities in fintech and beyond."
                      </p>
                      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          3.5K connections
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          4.8 rating
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 text-center">
                      <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-white font-bold text-xl">EC</span>
                      </div>
                      <h3 className="font-semibold text-lg mb-1">Emma Chen</h3>
                      <p className="text-sm text-muted-foreground mb-3">Product Designer at Airbnb</p>
                      <Badge variant="outline" className="mb-3">Design Leader</Badge>
                      <p className="text-xs text-muted-foreground mb-4">
                        "Creating user experiences that delight and solving complex design challenges."
                      </p>
                      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          2.1K connections
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          5.0 rating
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">How Professional Networking Works</h2>
                <div className="grid md:grid-cols-4 gap-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <UserPlus className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">1. Create Profile</h3>
                    <p className="text-sm text-muted-foreground">Build your professional profile with video intro</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">2. Discover People</h3>
                    <p className="text-sm text-muted-foreground">Find professionals who align with your goals</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Handshake className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">3. Connect & Chat</h3>
                    <p className="text-sm text-muted-foreground">Send connection requests and start conversations</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">4. Grow Together</h3>
                    <p className="text-sm text-muted-foreground">Collaborate and unlock new opportunities</p>
                  </div>
                </div>
              </div>

              {/* Success Stories */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Success Stories</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "I connected with a mentor who helped me transition from marketing to product management. The video profiles made it easy to find someone who shared my passion for technology."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">David Rodriguez</p>
                          <p className="text-xs text-muted-foreground">Product Manager</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "As a recruiter, this platform has been invaluable for finding passive candidates. The quality of connections and conversations is unmatched."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Lisa Wang</p>
                          <p className="text-xs text-muted-foreground">Senior Recruiter</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">Ready to Expand Your Professional Network?</h3>
                <p className="text-muted-foreground mb-6">
                  Join thousands of professionals who are building meaningful connections and advancing their careers.
                </p>
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
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

  // If user is authenticated, show the actual people page (placeholder for now)
  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation 
          onMenuClick={() => setSidebarOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          sidebarCollapsed={sidebarCollapsed}
        />
        
        <div className="pt-16 p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Professional Network</h1>
            <p className="text-muted-foreground mb-8">Connect with professionals in your industry.</p>
            
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Your network is growing</h3>
                <p className="text-muted-foreground mb-4">Start connecting with professionals in your field</p>
                <Button>Find People</Button>
              </CardContent>
            </Card>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
