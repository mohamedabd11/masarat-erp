import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n';
import { AuthProvider } from '@/providers/AuthProvider';
import { DirectionProvider } from '@/providers/DirectionProvider';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
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
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-surface-muted text-slate-900 min-h-screen">
        <NextIntlClientProvider messages={messages}>
          <DirectionProvider locale={locale}>
            <AuthProvider>
              {children}
            </AuthProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
