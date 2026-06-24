import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lorcana: {
          amber: "#F5A623",
          amethyst: "#9B59B6",
          emerald: "#2ECC71",
          ruby: "#E74C3C",
          sapphire: "#3498DB",
          steel: "#95A5A6",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
