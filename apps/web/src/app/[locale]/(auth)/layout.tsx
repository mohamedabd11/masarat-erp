import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — illustration/branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 flex-col items-center justify-center p-12 text-white relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -start-24 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -bottom-16 -end-16 w-72 h-72 bg-white/5 rounded-full" />

        <div className="max-w-md text-center relative z-10">
          {/* Logo */}
          <div className="w-24 h-24 bg-white/15 border border-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <span className="text-5xl font-bold">م</span>
          </div>
          <h1 className="text-4xl font-bold mb-3">مسارات</h1>
          <p className="text-lg text-brand-100 mb-1">نظام إدارة وكالات السفر المتكامل</p>
          <p className="text-brand-300 text-sm mb-12">Travel Agency Management System</p>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-3 text-start">
            {[
              { icon: '🧾', label: 'ZATCA Phase 2', desc: 'فاتورة إلكترونية متوافقة' },
              { icon: '📊', label: 'IFRS 2026',     desc: 'معايير المحاسبة الدولية'  },
              { icon: '💱', label: 'متعدد العملات',  desc: 'SAR · USD · EUR'          },
              { icon: '⚡', label: 'Real-time',      desc: 'تحديث فوري للبيانات'      },
              { icon: '👥', label: 'فريق متعدد',     desc: 'صلاحيات وأدوار مرنة'      },
              { icon: '📱', label: 'متجاوب بالكامل', desc: 'يعمل على جميع الأجهزة'   },
            ].map((f) => (
              <div key={f.label} className="bg-white/10 border border-white/10 rounded-xl p-3.5 hover:bg-white/15 transition-colors">
                <div className="text-lg mb-1">{f.icon}</div>
                <div className="font-semibold text-sm">{f.label}</div>
                <div className="text-xs text-brand-200 mt-0.5">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Trial badge */}
          <div className="mt-8 inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-sm font-medium">تجربة مجانية 14 يوماً — بدون بطاقة ائتمان</span>
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
