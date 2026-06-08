import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Providers from '../components/providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'TeleHub — Telegram Broadcast Command Center',
  description: 'One Dashboard, Unlimited Reach - Manage, schedule and broadcast messages to multiple Telegram groups and channels.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TeleHub',
  },
};

export const viewport: Viewport = {
  themeColor: '#0088cc',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
