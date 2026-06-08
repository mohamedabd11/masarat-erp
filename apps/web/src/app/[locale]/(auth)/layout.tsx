import type { ReactNode } from 'react';
import { MasaratLogo } from '@/components/ui/MasaratLogo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — calm brand panel (hidden on mobile). Marketing lives on the
          public landing page; the login stays focused. */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 flex-col items-center justify-center p-12 text-white relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -start-24 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -bottom-16 -end-16 w-72 h-72 bg-white/5 rounded-full" />

        <div className="max-w-sm text-center relative z-10">
          {/* Real logo on a white card (replaces the "م" placeholder) */}
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 mx-auto mb-8 w-fit">
            <MasaratLogo size={120} variant="full" />
          </div>

          <p className="text-lg text-brand-100">نظام إدارة وكالات السفر</p>
          <p className="text-brand-300 text-sm mt-1">Travel Agency Management System</p>

          {/* Minimal trust row — not a marketing grid */}
          <div className="mt-10 flex items-center justify-center gap-5 text-sm text-brand-100/90">
            <span>محاسبة IFRS</span>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span>ضريبة VAT</span>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span>عربي / English</span>
          </div>

          <a
            href="/"
            className="mt-10 inline-block text-sm text-white/80 hover:text-white underline underline-offset-4 transition-colors"
          >
            ← تعرّف على النظام
          </a>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-surface-muted">
        {/* Card on mobile, frameless on desktop */}
        <div className="w-full max-w-sm lg:max-w-md bg-white lg:bg-transparent rounded-2xl lg:rounded-none shadow-xl lg:shadow-none p-6 sm:p-8 lg:p-0">
          {children}
        </div>
      </div>
    </div>
  );
}
