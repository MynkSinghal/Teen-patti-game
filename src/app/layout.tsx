import type { Metadata, Viewport } from 'next';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/800.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Private Teen Patti',
  description: 'A private Teen Patti table for you and your friends. Virtual chips only.',
  appleWebApp: { capable: true, title: 'Teen Patti', statusBarStyle: 'black-translucent' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0b0805',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
