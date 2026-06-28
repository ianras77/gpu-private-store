import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rassy Online",
  description: "A magical RassyCodex web app for chat, documents, vectors, and admin workflows.",
  applicationName: "Rassy Online"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
