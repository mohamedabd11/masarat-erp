'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { TrialBanner } from '@/components/layout/TrialBanner';
import { SubscriptionExpiredOverlay } from '@/components/layout/SubscriptionExpiredOverlay';
import { SubscriptionProvider, useSubscription } from '@/providers/SubscriptionProvider';
import { cn } from '@/lib/utils';

// ─── Inner layout — reads subscription context ────────────────────────────────

function DashboardInner({ children }: { children: ReactNode }) {
  const [sidebarCollapsed,  setSidebarCollapsed]  = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { isExpired } = useSubscription();

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-50 flex-shrink-0">
            <Sidebar
              onToggle={() => setMobileSidebarOpen(false)}
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Trial banner — sits above header */}
        <TrialBanner />

        <Header onMenuToggle={() => setMobileSidebarOpen(v => !v)} />

        <main className={cn('flex-1 overflow-y-auto', isExpired && 'pointer-events-none select-none')}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </div>
        </main>
      </div>

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
