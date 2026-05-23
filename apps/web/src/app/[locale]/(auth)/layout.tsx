import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — illustration/branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 flex-col items-center justify-center p-12 text-white">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <span className="text-4xl font-bold">م</span>
          </div>
          <h1 className="text-4xl font-bold mb-4 font-arabic">مسارات</h1>
          <p className="text-xl text-brand-100 mb-2 font-arabic">نظام إدارة وكالات السفر المتكامل</p>
          <p className="text-brand-200 text-sm">Travel Agency Management System</p>

          <div className="mt-12 grid grid-cols-2 gap-4 text-start">
            {[
              { label: 'ZATCA Phase 2', desc: 'فاتورة إلكترونية متوافقة' },
              { label: 'IFRS 2026', desc: 'معايير المحاسبة الدولية' },
              { label: 'متعدد العملات', desc: 'SAR, USD, EUR' },
              { label: 'Real-time', desc: 'تحديث فوري للبيانات' },
            ].map((feature) => (
              <div key={feature.label} className="bg-white/10 rounded-xl p-4">
                <div className="font-semibold text-sm mb-1">{feature.label}</div>
                <div className="text-xs text-brand-200 font-arabic">{feature.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-surface-muted">
        {children}
      </div>
    </div>
  );
}
