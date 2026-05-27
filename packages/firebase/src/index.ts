export { initFirebase, getApp } from './config';
export { useAuth } from './hooks/useAuth';
export type { MasaratClaims, AuthUser, UseAuthReturn } from './hooks/useAuth';

// Firestore collection helpers — used only by MigrationTool (dev tool)
export { bookingsCol, customersCol, invoicesCol, bookingDoc, customerDoc } from './collections';
export { getBookings, getBooking, createBookingDraft, updateBookingFields, getBookingStats } from './bookings';
export { getCustomers, getCustomer, createCustomer, updateCustomer, searchCustomers } from './customers';
export { getInvoices, getInvoice, getInvoicesByBooking, getInvoiceStats } from './invoices';
export { useBookings, usePendingApprovals } from './hooks/useBookings';
export type { BookingDoc, CustomerDoc, InvoiceDoc, JournalEntryDoc, UserDoc, BookingStatus, PaymentStatus, BookingType } from './types';
export type { UseBookingsOptions } from './hooks/useBookings';
export type { CustomerFilters, CreateCustomerInput } from './customers';
export type { InvoiceFilters } from './invoices';
