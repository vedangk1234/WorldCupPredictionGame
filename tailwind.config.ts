import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: "var(--pitch-950)",
          900: "var(--pitch-900)",
          800: "var(--pitch-800)",
          line: "var(--pitch-line)",
          500: "var(--pitch-500)",
        },
        gold: { 300: "var(--gold-300)", 400: "var(--gold-400)" },
        chalk: { DEFAULT: "var(--chalk)", dim: "var(--chalk-dim)" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
