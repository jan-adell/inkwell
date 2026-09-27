import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          void: "var(--color-bg)",
          deep: "var(--color-surface)",
          surface: "var(--color-elevated)",
          border: "var(--color-border)",
          muted: "var(--color-muted-surface)",
        },
        gold: {
          DEFAULT: "var(--color-accent)",
          bright: "var(--color-accent-bright)",
          dim: "var(--color-accent-dim)",
        },
        ivory: {
          DEFAULT: "var(--color-text)",
          dim: "var(--color-text-dim)",
          ghost: "var(--color-text-ghost)",
        },
        crimson: {
          DEFAULT: "var(--color-danger)",
          dim: "var(--color-danger-dim)",
        },
      },
      fontFamily: {
        display: ["Georgia", "Times New Roman", "serif"],
        body: ["var(--font-primary)", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      backgroundImage: {
        "ink-gradient": "radial-gradient(ellipse at top, var(--color-elevated) 0%, var(--color-bg) 70%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
