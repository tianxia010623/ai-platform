import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#4f46e5",
          hover: "#4338ca",
          light: "#eef2ff",
        },
        ink: {
          DEFAULT: "#1f2328",
          muted: "#6b7280",
        },
      },
    },
  },
  plugins: [],
};

export default config;
