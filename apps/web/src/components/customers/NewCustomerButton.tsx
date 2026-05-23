'use client';

import { useAuth } from '@masarat/firebase';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { UserPlus } from 'lucide-react';

export function NewCustomerButton({ label }: { label: string }) {
  const { hasPermission } = useAuth();
  const locale = useLocale();
  if (!hasPermission('customers', 'write')) return null;
  return (
    <Link href={`/${locale}/customers/new`}>
      <Button>
        <UserPlus size={16} />
        {label}
      </Button>
    </Link>
  );
}
