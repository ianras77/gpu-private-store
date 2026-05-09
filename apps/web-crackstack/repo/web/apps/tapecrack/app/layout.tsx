import "./globals.css";

export const metadata = {
  title: "TAPECRACK",
  description: "Crack duct-taped data pipelines into repeatable programs."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
