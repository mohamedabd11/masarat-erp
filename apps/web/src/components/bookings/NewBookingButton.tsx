'use client';

import { useAuth } from '@masarat/firebase';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';

export function NewBookingButton({ label }: { label: string }) {
  const { hasPermission } = useAuth();
  const locale = useLocale();
  if (!hasPermission('bookings', 'write')) return null;
  return (
    <Link href={`/${locale}/bookings/new`}>
      <Button>
        <Plus size={16} />
        {label}
      </Button>
    </Link>
  );
}
