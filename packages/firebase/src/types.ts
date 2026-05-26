/**
 * @masarat/firebase — Firestore Document Types
 *
 * أنواع بيانات Firestore مع Timestamp بدلاً من Date.
 * هذه منفصلة عن أنواع العرض (UI types) التي تستخدم Date.
 */

import type { Timestamp } from 'firebase/firestore';

export type BookingStatus =
  | 'draft'
  | 'pending_approval'
  | 'confirmed'
  | 'ticketed'
  | 'completed'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus = 'unpaid' | 'partial' | 'fully_paid' | 'refunded';

export type BookingType =
  | 'flight' | 'hotel' | 'package' | 'umrah' | 'hajj'
  | 'insurance' | 'visa' | 'transport';

export type InvoiceType = 'tax_invoice' | 'credit_note' | 'debit_note';

// ─── Booking ──────────────────────────────────────────────────────────────────

export interface BookingPricing {
  revenueModel: 'agent' | 'principal';
  currency: 'SAR';
  totalCost: number;       // بالهللات
  serviceFee: number;      // بالهللات
  vatAmount: number;       // بالهللات
  totalAmount: number;     // بالهللات
  commission: number;      // بالهللات
}

export interface BookingPassenger {
  order: number;
  type: 'adult' | 'child' | 'infant';
  nameEn: string;
  nameAr: string;
  passportNumber: string;
  passportExpiry: string;
  nationality: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  customerId: string;
  ticket?: {
    number: string;
    status: 'active' | 'used' | 'refunded' | 'exchanged';
    issuedAt: Timestamp;
  };
}

export interface BookingDoc {
  id: string;
  agencyId: string;
  type: BookingType;
  status: BookingStatus;
  customerId: string;
  customerName: { ar: string; en: string };
  customerPhone: string;
  agentId: string;
  agentName: string;
  passengers: BookingPassenger[];
  pricing: BookingPricing;
  paymentStatus: PaymentStatus;
  totalPaid: number;   // بالهللات
  totalDue: number;    // بالهللات
  invoiceIds: string[];
  supplierId?: string;
  supplierName?: string;
  supplierRef?: string;
  bookingNumber?: string;
  travelDate: Timestamp;
  returnDate?: Timestamp;
  notes?: string;
  customFields: Record<string, unknown>;
  source: 'web' | 'mobile' | 'api';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  // حقول محسوبة مختصرة (قد تُخزَّن مُسبقاً لأداء القراءة)
  paidHalalas?: number;
  grandTotalHalalas?: number;
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface CustomerDoc {
  id: string;
  agencyId: string;
  type: 'individual' | 'company' | 'sub_agent';
  name: { ar: string; en: string };
  gender?: 'male' | 'female';
  nationality?: string;
  mobile: string;
  email?: string;
  tags: string[];
  tier: 'standard' | 'silver' | 'gold' | 'platinum';
  loyalty: { points: number; totalEarned: number };
  stats: { totalBookings: number; totalSpent: number; lastBookingAt?: Timestamp };
  flags: { hasUnpaidBalance: boolean; isBlacklisted: boolean };
  assignedAgentId?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

export interface InvoiceDoc {
  id: string;
  agencyId: string;
  type: InvoiceType;
  invoiceNumber: string;
  bookingId: string;
  originalInvoiceId?: string;
  seller: {
    name: { ar: string; en: string };
    vatNumber: string;
    crNumber: string;
    address: Record<string, string>;
  };
  buyer: {
    id: string;
    name: { ar: string; en: string };
    vatNumber?: string;
    phone: string;
  };
  totals: {
    subtotalExclVat: number;
    totalVat: number;
    grandTotal: number;
    currency: 'SAR';
  };
  zatca: {
    invoiceUUID: string;
    invoiceTypeCode: '388' | '381' | '383';
    submissionStatus: 'not_submitted' | 'submitted' | 'reported' | 'cleared' | 'rejected';
    qrCodeData?: string;
  };
  status: 'draft' | 'issued' | 'cancelled' | 'credited';
  paymentStatus: PaymentStatus;
  amountPaid: number;
  amountDue: number;
  journalEntryId: string;
  issueDate: Timestamp;
  createdAt: Timestamp;
  createdBy: string;
}

// ─── Journal Entry ────────────────────────────────────────────────────────────

export interface JournalLineDoc {
  lineNumber: number;
  accountCode: string;
  accountName: { ar: string; en: string };
  debit: number;
  credit: number;
  description: string;
}

export interface JournalEntryDoc {
  id: string;
  agencyId: string;
  type: string;
  description: string;
  entryDate: Timestamp;
  period: string;
  lines: JournalLineDoc[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  status: 'draft' | 'posted' | 'reversed';
  isAuto: boolean;
  createdAt: Timestamp;
  createdBy: string;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface UserDoc {
  id: string;
  agencyId: string;
  name: { ar: string; en: string };
  email: string;
  mobile: string;
  role: string;
  preferences: {
    language: 'ar' | 'en';
    theme: 'light' | 'dark' | 'system';
  };
  isActive: boolean;
  lastLoginAt?: Timestamp;
  createdAt: Timestamp;
}
