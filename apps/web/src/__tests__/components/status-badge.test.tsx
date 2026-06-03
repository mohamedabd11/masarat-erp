// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { Badge } from '@/components/ui/Badge';
import {
  InvoiceStatusBadge,
  BookingStatusBadge,
} from '@/components/ui/StatusBadge';

afterEach(() => cleanup());

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies the success variant colour classes', () => {
    render(<Badge variant="success">Paid</Badge>);
    const el = screen.getByText('Paid');
    expect(el.className).toContain('bg-emerald-100');
    expect(el.className).toContain('text-emerald-700');
  });

  it('applies the danger variant colour classes', () => {
    render(<Badge variant="danger">Overdue</Badge>);
    const el = screen.getByText('Overdue');
    expect(el.className).toContain('bg-red-100');
    expect(el.className).toContain('text-red-700');
  });

  it('merges a custom className', () => {
    render(<Badge className="custom-x">X</Badge>);
    expect(screen.getByText('X').className).toContain('custom-x');
  });
});

describe('InvoiceStatusBadge', () => {
  it('renders Arabic label by default for "paid"', () => {
    render(<InvoiceStatusBadge status="paid" />);
    const el = screen.getByText('مدفوع');
    expect(el).toBeInTheDocument();
    // paid -> success -> green
    expect(el.className).toContain('bg-emerald-100');
  });

  it('renders English label when locale="en"', () => {
    render(<InvoiceStatusBadge status="overdue" locale="en" />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('renders overdue with the danger (red) variant', () => {
    render(<InvoiceStatusBadge status="overdue" />);
    const el = screen.getByText('متأخر');
    expect(el.className).toContain('bg-red-100');
  });

  it('renders draft with the neutral variant', () => {
    render(<InvoiceStatusBadge status="draft" locale="en" />);
    const el = screen.getByText('Draft');
    expect(el.className).toContain('bg-slate-100');
  });

  it('supports payment-status values (fully_paid -> success/green)', () => {
    render(<InvoiceStatusBadge status="fully_paid" locale="en" />);
    const el = screen.getByText('Paid');
    expect(el.className).toContain('bg-emerald-100');
  });

  it('renders payment status "unpaid" with danger variant', () => {
    render(<InvoiceStatusBadge status="unpaid" locale="en" />);
    const el = screen.getByText('Unpaid');
    expect(el.className).toContain('bg-red-100');
  });

  it('falls back to the raw status string for unknown values', () => {
    render(<InvoiceStatusBadge status="totally_unknown" />);
    expect(screen.getByText('totally_unknown')).toBeInTheDocument();
  });
});

describe('BookingStatusBadge', () => {
  it('renders confirmed with the success variant in Arabic', () => {
    render(<BookingStatusBadge status="confirmed" />);
    const el = screen.getByText('مؤكد');
    expect(el.className).toContain('bg-emerald-100');
  });

  it('renders cancelled with the danger variant', () => {
    render(<BookingStatusBadge status="cancelled" locale="en" />);
    const el = screen.getByText('Cancelled');
    expect(el.className).toContain('bg-red-100');
  });

  it('falls back to the raw status string for unknown values', () => {
    render(<BookingStatusBadge status="weird_state" />);
    expect(screen.getByText('weird_state')).toBeInTheDocument();
  });
});
