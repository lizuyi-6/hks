import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        sand: "#F5E9D4",
        ink: "#172033",
        rust: "#A04A2A"
      },
      fontFamily: {
        sans: ["var(--font-body)", "sans-serif"],
        serif: ["var(--font-display)", "serif"]
      },
      boxShadow: {
        soft: "0 20px 80px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

