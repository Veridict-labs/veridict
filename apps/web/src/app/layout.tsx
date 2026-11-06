import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Veridict',
  description:
    'Trusted workplace answers, grounded in verifiable organizational evidence.',
};

// Applies the saved theme before paint so there is no light/dark flash.
const themeScript = `(function(){var t;try{t=localStorage.getItem('vd-theme')}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
