/**
 * @masarat/firebase — Typed Collection References
 *
 * نقطة مركزية واحدة لكل مجموعات Firestore.
 * يضمن أن أسماء المجموعات لا تتفرق في الكود.
 */

import {
  getFirestore,
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { getApp } from './config';
import type { BookingDoc, CustomerDoc, InvoiceDoc, JournalEntryDoc, UserDoc } from './types';

// ─── دوال المجموعات المطبوعة ──────────────────────────────────────────────────

export function bookingsCol(): CollectionReference<BookingDoc> {
  return collection(getFirestore(getApp()), 'bookings') as CollectionReference<BookingDoc>;
}

export function bookingDoc(bookingId: string): DocumentReference<BookingDoc> {
  return doc(getFirestore(getApp()), 'bookings', bookingId) as DocumentReference<BookingDoc>;
}

export function customersCol(): CollectionReference<CustomerDoc> {
  return collection(getFirestore(getApp()), 'customers') as CollectionReference<CustomerDoc>;
}

export function customerDoc(customerId: string): DocumentReference<CustomerDoc> {
  return doc(getFirestore(getApp()), 'customers', customerId) as DocumentReference<CustomerDoc>;
}

export function invoicesCol(): CollectionReference<InvoiceDoc> {
  return collection(getFirestore(getApp()), 'invoices') as CollectionReference<InvoiceDoc>;
}

export function invoiceDoc(invoiceId: string): DocumentReference<InvoiceDoc> {
  return doc(getFirestore(getApp()), 'invoices', invoiceId) as DocumentReference<InvoiceDoc>;
}

export function journalEntriesCol(): CollectionReference<JournalEntryDoc> {
  return collection(getFirestore(getApp()), 'journal_entries') as CollectionReference<JournalEntryDoc>;
}

export function agencyConfigDoc(agencyId: string, configName: string): DocumentReference {
  return doc(getFirestore(getApp()), 'agencies', agencyId, 'config', configName);
}

export function agencyModulesDoc(agencyId: string): DocumentReference {
  return agencyConfigDoc(agencyId, 'modules');
}

export function usersCol(): CollectionReference<UserDoc> {
  return collection(getFirestore(getApp()), 'users') as CollectionReference<UserDoc>;
}

export function userDoc(userId: string): DocumentReference<UserDoc> {
  return doc(getFirestore(getApp()), 'users', userId) as DocumentReference<UserDoc>;
}
