import './globals.css';
import AppChrome from '../components/AppChrome';

export const metadata = {
  title: 'USMender',
  description:
    'A mobile-first repair messenger around a local Matrix core with approved, mediated shared messages.'
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
