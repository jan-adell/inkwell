import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Inkwell design tokens
        ink: {
          void: "#0a0b0f",       // near-black background
          deep: "#0f1117",       // primary surface
          surface: "#161820",    // elevated surface
          border: "#1e2130",     // subtle border
          muted: "#2a2d3e",      // muted surface
        },
        gold: {
          DEFAULT: "#c9a84c",    // primary accent — aged gold
          bright: "#e8c76a",     // hover gold
          dim: "#7a6430",        // muted gold
        },
        ivory: {
          DEFAULT: "#f0ead6",    // primary text
          dim: "#a89f8c",        // secondary text
          ghost: "#5a5549",      // placeholder text
        },
        crimson: {
          DEFAULT: "#8b2635",    // danger / error accent
          dim: "#5c1a23",
        },
      },
      fontFamily: {
        // System stack — no external network calls
        display: ["Georgia", "Times New Roman", "serif"],
        body: ["system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      backgroundImage: {
        "ink-gradient": "radial-gradient(ellipse at top, #161820 0%, #0a0b0f 70%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
