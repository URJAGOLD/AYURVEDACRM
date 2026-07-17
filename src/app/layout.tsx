import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
export const metadata: Metadata = { title: "Amri Ayurveda CRM", description: "Manage Orders + Shiprocket - multi-user CRM" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><Providers>{children}</Providers></body></html>);
}