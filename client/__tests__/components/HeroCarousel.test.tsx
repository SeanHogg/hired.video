import { render, screen, fireEvent } from "@testing-library/react";
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

  it("should navigate to signup when 'Get Started' is clicked and user is not authenticated", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
    });

    render(
      <TestWrapper>
        <HeroCarousel totalViews="1.2K" totalItems={100} />
      </TestWrapper>
    );

    const getStartedButton = screen.getByText("Get Started");
    fireEvent.click(getStartedButton);

    expect(mockNavigate).toHaveBeenCalledWith("/signup");
  });

  it("should navigate to dashboard when 'Get Started' is clicked and user is authenticated", () => {
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

    const getStartedButton = screen.getByText("Get Started");
    fireEvent.click(getStartedButton);

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("should navigate to about page when 'Watch Demo' is clicked", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
    });

    render(
      <TestWrapper>
        <HeroCarousel totalViews="1.2K" totalItems={100} />
      </TestWrapper>
    );

    const watchDemoButton = screen.getByText("Watch Demo");
    fireEvent.click(watchDemoButton);

    expect(mockNavigate).toHaveBeenCalledWith("/about");
  });
});
