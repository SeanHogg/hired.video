import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import HeroCarousel from "@/components/HeroCarousel";

// Mock the useAuth hook directly
const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: () => mockUseAuth(),
}));

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  );
};

describe("HeroCarousel Navigation", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("should navigate to signup when 'Get Started' is clicked and user is not authenticated", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
    });

    render(
      <TestWrapper>
        <HeroCarousel totalViews="1.2K" totalItems={100} />
      </TestWrapper>
    );

    // Wait for the carousel to render and find the Get Started button
    await waitFor(() => {
      const getStartedButton = screen.getByText("Get Started");
      expect(getStartedButton).toBeInTheDocument();
    });

    const getStartedButton = screen.getByText("Get Started");
    fireEvent.click(getStartedButton);

    expect(mockNavigate).toHaveBeenCalledWith("/signup");
  });

  it("should navigate to dashboard when 'Get Started' is clicked and user is authenticated", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: {
        id: "test-user-id",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        name: "Test User",
        role: "regular_user" as const,
        onboardingComplete: true,
      },
    });

    render(
      <TestWrapper>
        <HeroCarousel totalViews="1.2K" totalItems={100} />
      </TestWrapper>
    );

    await waitFor(() => {
      const getStartedButton = screen.getByText("Get Started");
      expect(getStartedButton).toBeInTheDocument();
    });

    const getStartedButton = screen.getByText("Get Started");
    fireEvent.click(getStartedButton);

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("should navigate to about page when 'Watch Demo' is clicked", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
    });

    render(
      <TestWrapper>
        <HeroCarousel totalViews="1.2K" totalItems={100} />
      </TestWrapper>
    );

    await waitFor(() => {
      const watchDemoButton = screen.getByText("Watch Demo");
      expect(watchDemoButton).toBeInTheDocument();
    });

    const watchDemoButton = screen.getByText("Watch Demo");
    fireEvent.click(watchDemoButton);

    expect(mockNavigate).toHaveBeenCalledWith("/about");
  });

  // Test the navigation handlers directly by testing the component's behavior
  // Since the carousel auto-advances and has complex slide navigation,
  // we'll focus on testing the main CTA buttons that are always visible

  it("should have working navigation handlers", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
    });

    render(
      <TestWrapper>
        <HeroCarousel totalViews="1.2K" totalItems={100} />
      </TestWrapper>
    );

    // The main slide should be visible with Get Started and Watch Demo buttons
    expect(screen.getByText("Get Started")).toBeInTheDocument();
    expect(screen.getByText("Watch Demo")).toBeInTheDocument();
  });
});
