import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blondes Against Trump",
  description: "A cowgirl-sharp anti-Trump blog with political heat, linked receipts, live channels, and a woman-led voice you can actually feel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
