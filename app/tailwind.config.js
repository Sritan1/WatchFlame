/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Surfaces (sampled from mockups: near-black backgrounds, slightly raised cards)
        ink: {
          950: "#0a0a0b",
          900: "#111113",
          800: "#1a1a1d",
          700: "#26262a",
          600: "#3a3a40",
        },
        // Text
        chalk: {
          50: "#f8fafc",
          100: "#e5e7eb",
          400: "#9ca3af",
          500: "#6b7280",
        },
        // Risk / status colors (sampled from the LOW pill, EVAC banner, EXTREME label)
        risk: {
          low: "#7ee787",       // mint-green for LOW + "View Live Map" CTA
          moderate: "#fbbf24",  // amber
          high: "#fb923c",      // orange
          extreme: "#ef4444",   // red, for EXTREME / evacuate
        },
        // Brand-y accents
        ember: {
          DEFAULT: "#ff5a3c",   // primary CTA (Full Details / Emergency Support)
          glow: "#ff7a5c",
        },
        warn: "#f59e0b",        // evacuation-warning amber border
      },
      fontFamily: {
        mono: ["SpaceMono"],
      },
    },
  },
  plugins: [],
};
