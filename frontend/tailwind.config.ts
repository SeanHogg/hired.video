import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  // Include only source files where Tailwind classes are used (avoid scanning node_modules)
  content: [
    "./index.html",
    "./App.tsx",
    "./components/**/*.{ts,tsx}",
    "./pages/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        rail: {
          DEFAULT: "hsl(var(--rail-background))",
          foreground: "hsl(var(--rail-foreground))",
          muted: "hsl(var(--rail-muted))",
          hover: "hsl(var(--rail-hover))",
          active: "hsl(var(--rail-active))",
          "active-foreground": "hsl(var(--rail-active-foreground))",
          border: "hsl(var(--rail-border))",
          usage: "hsl(var(--rail-usage-background))",
          "usage-foreground": "hsl(var(--rail-usage-foreground))",
          "usage-muted": "hsl(var(--rail-usage-muted))",
          "usage-border": "hsl(var(--rail-usage-border))",
        },
        footer: {
          DEFAULT: "hsl(var(--footer-background))",
          foreground: "hsl(var(--footer-foreground))",
          muted: "hsl(var(--footer-muted))",
          brand: "hsl(var(--footer-brand))",
          strong: "hsl(var(--footer-strong-background))",
          "strong-foreground": "hsl(var(--footer-strong-foreground))",
        },
        brand: {
          purple: "hsl(var(--brand-purple))",
          "purple-light": "hsl(var(--brand-purple-light))",
          "purple-dark": "hsl(var(--brand-purple-dark))",
          blue: "hsl(var(--brand-blue))",
          "blue-light": "hsl(var(--brand-blue-light))",
          green: "hsl(var(--brand-green))",
          orange: "hsl(var(--brand-orange))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        // Gamification (points + badges). Shared by StreakFlame,
        // BadgesGallery (freshly-earned throb) and CelebrationOverlay.
        "flame-flicker": {
          "0%, 100%": { transform: "scale(1) rotate(-1.5deg)", opacity: "0.92" },
          "50%": { transform: "scale(1.12) rotate(1.5deg)", opacity: "1" },
        },
        "badge-throb": {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--badge-glow, rgba(251,191,36,0))" },
          "50%": { boxShadow: "0 0 18px 5px var(--badge-glow, rgba(251,191,36,0.55))" },
        },
        "celebrate-in": {
          "0%": { transform: "scale(0.3) rotate(-12deg)", opacity: "0" },
          "55%": { transform: "scale(1.18) rotate(4deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        "confetti-fall": {
          "0%": { transform: "translate3d(0,0,0) rotate(0deg)", opacity: "1" },
          "100%": {
            transform:
              "translate3d(var(--confetti-x, 0), var(--confetti-y, 120px), 0) rotate(var(--confetti-r, 360deg))",
            opacity: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "flame-flicker": "flame-flicker 1.4s ease-in-out infinite",
        "badge-throb": "badge-throb 1.6s ease-in-out infinite",
        "celebrate-in": "celebrate-in 0.6s cubic-bezier(.2,.85,.25,1) both",
        "confetti-fall": "confetti-fall 1.1s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
