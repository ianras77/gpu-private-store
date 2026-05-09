import "./globals.css";

export const metadata = {
  title: "XLCRACK",
  description: "Crack messy spreadsheets into clean truth."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
