/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f0f10",
        canvas: "#ffffff",
        rail: "#fafafa",
        card: "#f7f7f5",
        line: "#ececea",
        "line-soft": "#f1f1f1",
        hover: "#f3f3f2",
        active: "#efefef",
        muted: "#5f5f5f",
        faint: "#6f6f6f",
        accent: "#e55e40",
        chart: "#ff4b4b",
        "chart-fill": "#fff2f2",
        promo: "#fda82b",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-inter-tight)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        micro: ["11.5px", { lineHeight: "16px" }],
        ui: ["13px", { lineHeight: "18px" }],
      },
      keyframes: { marquee: { to: { transform: "translateX(-50%)" } } },
      animation: { marquee: "marquee 45s linear infinite" },
    },
  },
  plugins: [],
};
