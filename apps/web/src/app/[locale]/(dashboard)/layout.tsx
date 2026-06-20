'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { TrialBanner } from '@/components/layout/TrialBanner';
import { SubscriptionExpiredOverlay } from '@/components/layout/SubscriptionExpiredOverlay';
import { SubscriptionProvider, useSubscription } from '@/providers/SubscriptionProvider';
import { usePersistedState } from '@/hooks/usePersistedState';
import { cn } from '@/lib/utils';

// ─── Inner layout — reads subscription context ────────────────────────────────

function DashboardInner({ children }: { children: ReactNode }) {
  const [sidebarCollapsed,  setSidebarCollapsed]  = usePersistedState('masarat:sidebar:collapsed', false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { isExpired } = useSubscription();

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted print:block print:h-auto print:overflow-visible">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex flex-shrink-0 print:hidden">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex print:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-50 flex-shrink-0">
            <Sidebar onClose={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden print:block print:overflow-visible">
        {/* Trial banner + Header — hidden when printing */}
        <div className="print:hidden">
          <TrialBanner />
          <Header
            onMenuToggle={() => setMobileSidebarOpen(v => !v)}
            onSidebarToggle={() => setSidebarCollapsed(v => !v)}
            sidebarCollapsed={sidebarCollapsed}
          />
        </div>

        <main className={cn('flex-1 overflow-y-auto print:overflow-visible', isExpired && 'pointer-events-none select-none')}>
          {/* Extra bottom padding on mobile clears the fixed bottom nav (+ safe area). */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-6 print:p-0 print:max-w-none">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation — hidden on lg+ and when printing */}
      {!isExpired && <BottomNav onMore={() => setMobileSidebarOpen(true)} />}

      {/* Full-screen lock when trial/subscription expired */}
      {isExpired && <SubscriptionExpiredOverlay />}
    </div>
  );
}

// ─── Outer layout — provides subscription context ─────────────────────────────

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SubscriptionProvider>
      <DashboardInner>{children}</DashboardInner>
    </SubscriptionProvider>
  );
}
