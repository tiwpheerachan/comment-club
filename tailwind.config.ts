import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shopee: { DEFAULT: "#ee4d2d", light: "#ff6b3d" },
        pos: { DEFAULT: "#16a34a", bg: "#e8f7ee" },
        neg: { DEFAULT: "#dc2626", bg: "#fdecec" },
        neu: { DEFAULT: "#d97706", bg: "#fdf3e3" },
        ink: "#1c2330",
        muted: "#6b7280",
        line: "#e6e8ec",
      },
      fontFamily: {
        sans: ["var(--font-thai)", '"IBM Plex Sans Thai"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06)",
        lg2: "0 4px 16px rgba(16,24,40,.08)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
