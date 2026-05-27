import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Tajawal, Inter } from 'next/font/google';
import { locales, type Locale } from '@/i18n';
import { FirebaseProvider } from '@/providers/FirebaseProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { DirectionProvider } from '@/providers/DirectionProvider';

const tajawal = Tajawal({ subsets: ['arabic'], weight: ['300', '400', '500', '700'], display: 'swap', variable: '--font-arabic' });
const inter   = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], display: 'swap', variable: '--font-sans' });

export const dynamic = 'force-dynamic';

interface LocaleLayoutProps {
  children: ReactNode;
  params: { locale: string };
}

export async function generateMetadata({ params: { locale } }: LocaleLayoutProps): Promise<Metadata> {
  return {
    title: locale === 'ar' ? 'مسارات — نظام إدارة وكالات السفر' : 'Masarat — Travel Agency ERP',
  };
}

export default async function LocaleLayout({ children, params: { locale } }: LocaleLayoutProps) {
  if (!locales.includes(locale as Locale)) notFound();

  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={`${tajawal.variable} ${inter.variable}`}>
      <body className="antialiased bg-surface-muted text-slate-900 min-h-screen">
        <NextIntlClientProvider messages={messages}>
          <FirebaseProvider>
            <DirectionProvider locale={locale}>
              <AuthProvider>
                {children}
              </AuthProvider>
            </DirectionProvider>
          </FirebaseProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
