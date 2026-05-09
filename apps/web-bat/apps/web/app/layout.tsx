import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blondes Against Trump",
  description: "A human anti-Trump front page with open tabs, a real archive, linked receipts, and a host voice you can actually feel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
