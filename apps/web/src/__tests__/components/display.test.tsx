// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wallet } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';

afterEach(() => cleanup());

describe('formatCurrency (rendered in a StatsCard)', () => {
  it('formats 100000 halalas as 1,000.00 with Latin grouping', () => {
    // sanity-check the formatter itself
    expect(formatCurrency(100000)).toBe('1,000.00');
  });

  it('displays a formatted SAR amount as the card value', () => {
    const value = `${formatCurrency(100000)} ريال`;
    render(<StatsCard title="الإيرادات" value={value} icon={Wallet} />);
    expect(screen.getByText('1,000.00 ريال')).toBeInTheDocument();
  });

  it('keeps two fraction digits for amounts with halalas', () => {
    expect(formatCurrency(123456)).toBe('1,234.56');
  });
});

describe('StatsCard', () => {
  it('renders title, value and subtitle', () => {
    render(
      <StatsCard
        title="عدد الحجوزات"
        value={42}
        subtitle="هذا الشهر"
        icon={Wallet}
      />
    );
    expect(screen.getByText('عدد الحجوزات')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('هذا الشهر')).toBeInTheDocument();
  });

  it('shows an upward trend with green classes and an up arrow', () => {
    render(
      <StatsCard
        title="المبيعات"
        value="10,000.00"
        icon={Wallet}
        trend={{ value: 12, label: 'مقارنة بالأمس', direction: 'up' }}
      />
    );
    expect(screen.getByText('12%')).toBeInTheDocument();
    const trendChip = screen.getByText('12%').parentElement!;
    expect(trendChip.className).toContain('text-emerald-700');
    expect(trendChip.textContent).toContain('↑');
  });

  it('shows a downward trend with red classes and a down arrow', () => {
    render(
      <StatsCard
        title="المبيعات"
        value="10,000.00"
        icon={Wallet}
        trend={{ value: 5, label: 'انخفاض', direction: 'down' }}
      />
    );
    const trendChip = screen.getByText('5%').parentElement!;
    expect(trendChip.className).toContain('text-red-600');
    expect(trendChip.textContent).toContain('↓');
  });
});

describe('EmptyState', () => {
  it('renders the empty-state title (e.g. "no invoices")', () => {
    render(<EmptyState title="لا توجد فواتير" />);
    expect(screen.getByText('لا توجد فواتير')).toBeInTheDocument();
  });

  it('renders an optional description', () => {
    render(
      <EmptyState
        title="لا توجد فواتير"
        description="ابدأ بإنشاء أول فاتورة"
      />
    );
    expect(screen.getByText('ابدأ بإنشاء أول فاتورة')).toBeInTheDocument();
  });

  it('renders an action button and fires its handler', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="لا توجد فواتير"
        action={{ label: 'إنشاء فاتورة', onClick }}
      />
    );
    const btn = screen.getByRole('button', { name: 'إنشاء فاتورة' });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render an action button when no action is provided', () => {
    render(<EmptyState title="فارغ" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
