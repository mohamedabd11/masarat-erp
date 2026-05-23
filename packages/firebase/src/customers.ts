import { query, where, orderBy, limit, getDocs, getDoc, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { customersCol } from './collections';
import type { CustomerDoc } from './types';

export interface CustomerFilters {
  agencyId: string;
  search?: string;
  nationality?: string;
  pageSize?: number;
}

export interface CreateCustomerInput {
  agencyId: string;
  nameAr: string;
  nameEn?: string;
  phone: string;
  email?: string;
  nationalId?: string;
  passportNumber?: string;
  passportExpiry?: Date;
  nationality?: string;
  dateOfBirth?: Date;
  vatNumber?: string;
  address?: {
    city?: string;
    countryCode?: string;
  };
  notes?: string;
}

export async function getCustomers(filters: CustomerFilters): Promise<CustomerDoc[]> {
  const col = customersCol();
  const constraints = [
    where('agencyId', '==', filters.agencyId),
    orderBy('createdAt', 'desc'),
    limit(filters.pageSize ?? 50),
  ];

  const snap = await getDocs(query(col, ...constraints));
  return snap.docs.map(d => d.data());
}

export async function getCustomer(agencyId: string, customerId: string): Promise<CustomerDoc | null> {
  const ref = doc(customersCol(), customerId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function createCustomer(input: CreateCustomerInput): Promise<string> {
  const col = customersCol();
  const now = serverTimestamp();

  const data = {
    agencyId: input.agencyId,
    type: 'individual' as const,
    name: { ar: input.nameAr, en: input.nameEn ?? '' },
    mobile: input.phone,
    email: input.email ?? '',
    nationality: input.nationality ?? 'SA',
    tags: [] as string[],
    tier: 'standard' as const,
    loyalty: { points: 0, totalEarned: 0 },
    stats: { totalBookings: 0, totalSpent: 0 },
    flags: { hasUnpaidBalance: false, isBlacklisted: false },
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = await addDoc(col, data as any);
  return ref.id;
}

export async function updateCustomer(
  agencyId: string,
  customerId: string,
  updates: Partial<Omit<CreateCustomerInput, 'agencyId'>>
): Promise<void> {
  const ref = doc(customersCol(), customerId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}

export async function searchCustomers(agencyId: string, searchTerm: string): Promise<CustomerDoc[]> {
  const col = customersCol();

  const snap = await getDocs(
    query(
      col,
      where('agencyId', '==', agencyId),
      where('mobile', '>=', searchTerm),
      where('mobile', '<=', searchTerm + ''),
      limit(10)
    )
  );

  return snap.docs.map(d => d.data());
}
