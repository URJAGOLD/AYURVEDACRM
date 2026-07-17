import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { brand: { DEFAULT: "#1b7a43", dark: "#14532d", light: "#dcfce7" } } } },
  plugins: [],
};
export default config;