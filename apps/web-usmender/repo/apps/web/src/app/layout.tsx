import './globals.css';
import AppChrome from '../components/AppChrome';

export const metadata = {
  title: 'USMender',
  description: 'A warm, mobile-first mediation inbox where an LLM helps two people repair conflict.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
