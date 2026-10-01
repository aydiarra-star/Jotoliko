import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0F172A",
          900: "#0F172A",
          800: "#1E293B",
          700: "#334155",
          500: "#64748B",
        },
        brand: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          soft: "#EFF6FF",
          ring: "#BFDBFE",
        },
        success: {
          DEFAULT: "#10B981",
          soft: "#ECFDF5",
        },
        surface: "#F8FAFC",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      maxWidth: {
        shell: "1200px",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -12px rgba(15,23,42,0.12)",
        lift: "0 24px 60px -24px rgba(15,23,42,0.35)",
      },
      keyframes: {
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        marquee: "marquee 28s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
