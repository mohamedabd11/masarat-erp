/**
 * API client for the Masarat ERP web API.
 * Gets a Firebase ID token and attaches it as Bearer on every request.
 */

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://masarat.app';

async function getIdToken(): Promise<string | null> {
  try {
    const auth = (await import('@react-native-firebase/auth')).default;
    const user = auth().currentUser;
    if (!user) return null;
    return user.getIdToken();
  } catch {
    return null;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Bookings ──────────────────────────────────────────────────────────────────

export interface ApiBooking {
  id:                string;
  bookingNumber:     string;
  serviceType:       string;
  customTypeName:    string | null;
  customerNameAr:    string | null;
  customerNameEn:    string | null;
  customerPhone:     string | null;
  status:            string;
  totalPriceHalalas: number;
  paidHalalas:       number;
  createdAt:         string;
}

export async function fetchBookings(page = 1, limit = 20): Promise<{
  data: ApiBooking[]; total: number; hasMore: boolean;
}> {
  return apiFetch(`/api/bookings?page=${page}&limit=${limit}`);
}

// ── Customers ─────────────────────────────────────────────────────────────────

export interface ApiCustomer {
  id:             string;
  nameAr:         string;
  nameEn:         string | null;
  phone:          string | null;
  email:          string | null;
  nationalId:     string | null;
  totalBookings:  number;
  totalInvoiced:  number;
}

export async function fetchCustomers(page = 1, limit = 20): Promise<{
  data: ApiCustomer[]; total: number; hasMore: boolean;
}> {
  return apiFetch(`/api/customers?page=${page}&limit=${limit}`);
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export interface ApiInvoice {
  id:              string;
  invoiceNumber:   string;
  type:            string;
  buyerNameAr:     string | null;
  buyerNameEn:     string | null;
  totalHalalas:    number;
  paidHalalas:     number;
  status:          string;
  issueDate:       string;
  dueDate:         string | null;
}

export async function fetchInvoices(page = 1, limit = 20): Promise<{
  data: ApiInvoice[]; total: number; hasMore: boolean;
}> {
  return apiFetch(`/api/invoices?page=${page}&limit=${limit}`);
}

// ── Dashboard stats ───────────────────────────────────────────────────────────

export interface ApiDashboardStats {
  monthRevenue:    number;
  monthVat:        number;
  monthProfit:     number;
  activeBookings:  number;
  pendingBookings: number;
  arOutstanding:   number;
}

export async function fetchDashboardStats(): Promise<{ stats: ApiDashboardStats }> {
  return apiFetch('/api/dashboard/stats');
}
