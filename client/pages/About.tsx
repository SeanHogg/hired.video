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
  Video,
  Sparkles,
  ArrowRight,
  Users,
  Target,
  Heart,
  Brain,
  Zap,
  Globe,
  Award,
  Shield,
  TrendingUp,
  CheckCircle2,
  Star,
  MessageCircle,
} from "lucide-react";

export default function About() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated } = useAuth();

  const values = [
    {
      icon: Heart,
      title: "Passion for People",
      description: "We believe every professional deserves to showcase their unique talents and find meaningful career opportunities."
    },
    {
      icon: Brain,
      title: "Innovation First",
      description: "We leverage cutting-edge AI and video technology to solve real problems in recruitment and career development."
    },
    {
      icon: Shield,
      title: "Trust & Privacy",
      description: "Your data is sacred. We maintain the highest standards of privacy and security in everything we build."
    },
    {
      icon: Globe,
      title: "Global Impact",
      description: "Our platform connects talent worldwide, breaking down barriers and creating opportunities across borders."
    }
  ];

  const team = [
    {
      name: "Sarah Chen",
      role: "CEO & Co-Founder",
      bio: "Former VP of Talent at Google, passionate about transforming how people find and showcase their careers.",
      image: "/placeholder.svg"
    },
    {
      name: "Marcus Rodriguez",
      role: "CTO & Co-Founder", 
      bio: "AI researcher and former Meta engineer, focused on building intelligent systems that enhance human potential.",
      image: "/placeholder.svg"
    },
    {
      name: "Elena Kowalski",
      role: "VP of Product",
      bio: "Design thinking expert with 10+ years creating user-centered products at Spotify and Airbnb.",
      image: "/placeholder.svg"
    },
    {
      name: "David Kim",
      role: "VP of Engineering",
      bio: "Full-stack architect who's built scalable platforms at Uber and Netflix, ensuring our technology grows with you.",
      image: "/placeholder.svg"
    }
  ];

  const stats = [
    { number: "50K+", label: "Active Users" },
    { number: "1M+", label: "Video Resumes Created" },
    { number: "500+", label: "Companies Hiring" },
    { number: "95%", label: "User Satisfaction" }
  ];

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
        
        <div className="pt-16">
          {/* Hero Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
            <div className="max-w-6xl mx-auto text-center">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Video className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  MyVideoResume
                </span>
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                Transforming Careers with{" "}
                <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  AI & Video
                </span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                We're on a mission to revolutionize how people showcase their talents and find meaningful work. 
                Through AI-powered video resumes and intelligent matching, we're making career success accessible to everyone.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                    Join Our Mission
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="text-lg px-8">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Contact Us
                </Button>
              </div>
            </div>
          </section>

          {/* Stats Section */}
          <section className="py-16 px-4 sm:px-6 lg:px-8 border-b border-border">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {stats.map((stat, index) => (
                  <div key={index} className="text-center">
                    <div className="text-4xl md:text-5xl font-bold text-primary mb-2">{stat.number}</div>
                    <div className="text-muted-foreground font-medium">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Mission Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">Our Mission</h2>
                  <p className="text-lg text-muted-foreground mb-6">
                    Traditional resumes can't capture the full spectrum of human talent. We believe that everyone deserves 
                    to tell their story in a way that showcases their unique personality, skills, and potential.
                  </p>
                  <p className="text-lg text-muted-foreground mb-8">
                    By combining AI technology with video storytelling, we're creating a world where hiring is more human, 
                    more fair, and more effective for both candidates and employers.
                  </p>
                  <div className="flex items-center gap-4">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-medium">Making hiring more human</span>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-medium">Democratizing opportunity</span>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-medium">Powered by cutting-edge AI</span>
                  </div>
                </div>
                <div className="relative">
                  <div className="w-full h-96 bg-gradient-to-br from-brand-purple/20 to-brand-blue/20 rounded-2xl flex items-center justify-center">
                    <Video className="h-24 w-24 text-primary" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Values Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/20">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Values</h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  The principles that guide everything we do and every decision we make.
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {values.map((value, index) => (
                  <Card key={index} className="text-center">
                    <CardHeader>
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <value.icon className="h-8 w-8 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{value.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-sm">{value.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Team Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Meet Our Team</h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  Passionate professionals from diverse backgrounds, united by a vision to transform careers.
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {team.map((member, index) => (
                  <Card key={index} className="text-center">
                    <CardHeader>
                      <div className="w-24 h-24 bg-gradient-to-br from-brand-purple/20 to-brand-blue/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <Users className="h-12 w-12 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{member.name}</CardTitle>
                      <CardDescription className="font-medium text-primary">{member.role}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{member.bio}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Technology Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/20">
            <div className="max-w-6xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Built with Modern Technology</h2>
              <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
                Our platform leverages the latest advances in AI, video processing, and web technology 
                to deliver a seamless, secure, and scalable experience.
              </p>
              
              <div className="grid md:grid-cols-3 gap-8">
                <Card>
                  <CardHeader>
                    <Brain className="h-12 w-12 text-primary mx-auto mb-4" />
                    <CardTitle>AI-Powered Matching</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Advanced machine learning algorithms analyze skills, experience, and preferences 
                      to create perfect job matches.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Video className="h-12 w-12 text-primary mx-auto mb-4" />
                    <CardTitle>Video Technology</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      State-of-the-art video processing and AI generation tools that make creating 
                      professional video resumes accessible to everyone.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
                    <CardTitle>Enterprise Security</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Bank-level encryption, GDPR compliance, and robust privacy controls 
                      keep your data secure and private.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-12 rounded-2xl">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Transform Your Career?</h2>
              <p className="text-xl text-muted-foreground mb-8">
                Join thousands of professionals who are already using MyVideoResume to 
                showcase their talents and find amazing opportunities.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                    Get Started Today
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    View Pricing
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          <Footer />
        </div>
      </div>
    </div>
  );
}
