import { query, where, orderBy, limit, getDocs, getDoc, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { customersCol, db } from './collections';
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
  const col = customersCol(filters.agencyId);
  const constraints = [
    where('agencyId', '==', filters.agencyId),
    orderBy('createdAt', 'desc'),
    limit(filters.pageSize ?? 50),
  ];

  const snap = await getDocs(query(col, ...constraints));
  return snap.docs.map(d => d.data());
}

export async function getCustomer(agencyId: string, customerId: string): Promise<CustomerDoc | null> {
  const ref = doc(customersCol(agencyId), customerId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function createCustomer(input: CreateCustomerInput): Promise<string> {
  const col = customersCol(input.agencyId);
  const now = serverTimestamp();

  const data = {
    agencyId: input.agencyId,
    nameAr: input.nameAr,
    nameEn: input.nameEn ?? '',
    phone: input.phone,
    email: input.email ?? '',
    nationalId: input.nationalId ?? '',
    passportNumber: input.passportNumber ?? '',
    passportExpiry: input.passportExpiry ?? null,
    nationality: input.nationality ?? 'SA',
    dateOfBirth: input.dateOfBirth ?? null,
    vatNumber: input.vatNumber ?? '',
    address: input.address ?? { city: '', countryCode: 'SA' },
    notes: input.notes ?? '',
    totalBookings: 0,
    totalSpentHalalas: 0,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(col, data);
  return ref.id;
}

export async function updateCustomer(
  agencyId: string,
  customerId: string,
  updates: Partial<Omit<CreateCustomerInput, 'agencyId'>>
): Promise<void> {
  const ref = doc(customersCol(agencyId), customerId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}

export async function searchCustomers(agencyId: string, searchTerm: string): Promise<CustomerDoc[]> {
  const col = customersCol(agencyId);

  // Firestore doesn't support full-text search — query by phone prefix as primary key
  // For production, use Algolia or Typesense for full-text search
  const snap = await getDocs(
    query(
      col,
      where('agencyId', '==', agencyId),
      where('phone', '>=', searchTerm),
      where('phone', '<=', searchTerm + ''),
      limit(10)
    )
  );

  return snap.docs.map(d => d.data());
}

export { db };
