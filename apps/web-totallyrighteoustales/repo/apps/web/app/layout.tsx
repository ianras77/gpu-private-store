import "./globals.css";
import type { Metadata, Viewport } from "next";
import Shell from "../components/Shell";

export const metadata: Metadata = {
  title: "Totally Righteous Tales",
  description:
    "A whimsical storytelling commons for named storytellers, anonymous tales, and heart-powered story cred.",
  applicationName: "Totally Righteous Tales",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#160d10",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
