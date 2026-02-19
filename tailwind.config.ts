import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        nmq: "#ef4444",
        mqt: "#eab308",
        fmq: "#22c55e",
        ip: "#a855f7",
      },
    },
  },
  plugins: [],
} satisfies Config

export default config
