// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

afterEach(() => cleanup());

describe('Button', () => {
  it('exposes an accessible name from its text content', () => {
    render(<Button>حفظ</Button>);
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>اضغط</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'اضغط' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and does not fire onClick when loading', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>تحميل</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('respects the disabled prop', () => {
    render(<Button disabled>معطل</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies the danger variant classes', () => {
    render(<Button variant="danger">حذف</Button>);
    expect(screen.getByRole('button').className).toContain('bg-red-600');
  });
});

describe('Input', () => {
  it('associates an Arabic label with the input via htmlFor/id', () => {
    render(<Input label="اسم العميل" id="customer-name" />);
    const input = screen.getByLabelText('اسم العميل');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('id', 'customer-name');
  });

  it('marks required fields with an asterisk', () => {
    render(<Input label="البريد الإلكتروني" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders an error message', () => {
    render(<Input label="المبلغ" error="القيمة غير صحيحة" />);
    expect(screen.getByText('القيمة غير صحيحة')).toBeInTheDocument();
  });

  it('shows a hint only when there is no error', () => {
    const { rerender } = render(
      <Input label="x" hint="تلميح" />
    );
    expect(screen.getByText('تلميح')).toBeInTheDocument();
    rerender(<Input label="x" hint="تلميح" error="خطأ" />);
    expect(screen.queryByText('تلميح')).not.toBeInTheDocument();
    expect(screen.getByText('خطأ')).toBeInTheDocument();
  });

  it('accepts typed input', async () => {
    render(<Input label="ملاحظة" />);
    const input = screen.getByLabelText('ملاحظة') as HTMLInputElement;
    await userEvent.type(input, 'مرحبا');
    expect(input.value).toBe('مرحبا');
  });
});

describe('Select', () => {
  const options = [
    { value: 'sar', label: 'ريال سعودي' },
    { value: 'usd', label: 'دولار أمريكي' },
  ];

  it('renders all options with an Arabic label', () => {
    render(<Select label="العملة" options={options} />);
    expect(screen.getByLabelText('العملة')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'ريال سعودي' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'دولار أمريكي' })).toBeInTheDocument();
  });

  it('renders a disabled placeholder option', () => {
    render(<Select options={options} placeholder="اختر العملة" />);
    const placeholder = screen.getByRole('option', { name: 'اختر العملة' });
    expect(placeholder).toBeDisabled();
  });

  it('lets the user change the selected value', async () => {
    render(<Select label="العملة" options={options} />);
    const select = screen.getByLabelText('العملة') as HTMLSelectElement;
    await userEvent.selectOptions(select, 'usd');
    expect(select.value).toBe('usd');
  });
});
