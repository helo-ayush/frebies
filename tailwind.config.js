/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#0a0a0a", card: "#f4f3f1", line: "#e8e7e4", muted: "#7b7a77" },
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
      keyframes: { marquee: { to: { transform: "translateX(-50%)" } } },
      animation: { marquee: "marquee 45s linear infinite" },
    },
  },
  plugins: [],
};
