import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // แบรนด์ commentclub — เขียว sage (ใช้ชื่อ token เดิม "shopee" เพื่อไม่ต้องแก้ทุกที่)
        shopee: { DEFAULT: "#4e7d63", light: "#6fa085" },
        cc: { DEFAULT: "#4e7d63", light: "#6fa085", dark: "#3c6650" },
        pos: { DEFAULT: "#16a34a", bg: "#e8f7ee" },
        neg: { DEFAULT: "#dc2626", bg: "#fdecec" },
        neu: { DEFAULT: "#d97706", bg: "#fdf3e3" },
        ink: "#1c2330",
        muted: "#6b7280",
        line: "#e6e8ec",
      },
      fontFamily: {
        sans: ["var(--font-thai)", '"IBM Plex Sans Thai"', '"Segoe UI"', "system-ui", "sans-serif"],
        script: ["var(--font-script)", "cursive"],
        display: ["var(--font-display)", "var(--font-thai)", "sans-serif"],
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
