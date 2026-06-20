'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Mobile-only list primitives. They render a clean, tappable card list on
 * phones (below the `sm` breakpoint) and stay hidden on `sm+`, where pages
 * keep their full data table. Pairing `<MobileList>` with a
 * `hidden sm:block` table is the responsive pattern used across the app.
 *
 * Why cards on mobile: a 6–7 column financial table forces endless horizontal
 * scrolling on a phone and hides hover-only row actions (no hover on touch).
 * A card surfaces the 3–4 fields that matter and is fully tap-friendly.
 */

export function MobileList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('sm:hidden divide-y divide-surface-border', className)}>
      {children}
    </div>
  );
}

interface MobileListItemProps {
  /** When set, the whole card becomes a link. */
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  /** Optional left-edge accent (e.g. a status tint) or extra classes. */
  className?: string;
}

export function MobileListItem({ href, onClick, children, className }: MobileListItemProps) {
  const body = (
    <div className={cn('flex flex-col gap-2 px-4 py-3.5 active:bg-slate-50 transition-colors', className)}>
      {children}
    </div>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className="block">
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-start">
        {body}
      </button>
    );
  }
  return body;
}

/** Top line of a card: primary label on the start, a badge/amount on the end. */
export function MobileItemHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2">{children}</div>;
}

/** Bottom line of a card: secondary meta on the start, value on the end. */
export function MobileItemFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2">{children}</div>;
}
