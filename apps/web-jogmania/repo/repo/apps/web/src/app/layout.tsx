import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";
import { Orbitron, Space_Grotesk, Press_Start_2P } from "next/font/google";

const displayFont = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"]
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"]
});

const pixelFont = Press_Start_2P({
  subsets: ["latin"],
  variable: "--font-pixel",
  weight: "400"
});

export const metadata = {
  title: "Jogmania",
  description: "Retro-future running adventures powered by your real-world workouts."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} ${pixelFont.variable} font-body`}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
