import { notFound } from 'next/navigation';
import { PrintableInvoice } from '@/components/invoices/PrintableInvoice';

// Demo invoice matching INV-001 from the invoices list
const DEMO_INVOICE_DATA = {
  invoiceNumber: 'INV-2026-000248',
  uuid: 'a4f3b2c1-d5e6-4f78-9012-ab34cd56ef78',
  issueDate: new Date('2026-05-20'),
  dueDate: new Date('2026-06-05'),
  invoiceTypeCode: '388' as const,
  currency: 'SAR' as const,
  seller: {
    nameAr: 'مسارات للسياحة والسفر',
    nameEn: 'Masarat Travel & Tourism',
    vatNumber: '300000000000003',
    crNumber: '4030000000',
    address: {
      streetName: 'طريق الملك عبدالعزيز',
      buildingNumber: '3246',
      district: 'العليا',
      city: 'الرياض',
      postalCode: '12271',
    },
    phone: '+966 11 234 5678',
    email: 'invoices@masarat.sa',
  },
  buyer: {
    nameAr: 'أحمد محمد العمري',
    nameEn: 'Ahmed Al-Omari',
    phone: '0501234567',
  },
  lines: [
    {
      id: '1',
      nameAr: 'برنامج عمرة — 14 يوم (شخصين)',
      nameEn: 'Umrah Program — 14 Days (2 Persons)',
      quantity: 1,
      unitCode: 'PCE',
      unitPriceExclVatHalalas: 700000,
      totalExclVatHalalas: 700000,
      vatRate: 0,
      vatAmountHalalas: 0,
      totalInclVatHalalas: 700000,
    },
    {
      id: '2',
      nameAr: 'رسوم خدمة الوكالة',
      nameEn: 'Agency Service Fee',
      quantity: 1,
      unitCode: 'PCE',
      unitPriceExclVatHalalas: 50000,
      totalExclVatHalalas: 50000,
      vatRate: 0.15,
      vatAmountHalalas: 7500,
      totalInclVatHalalas: 57500,
    },
  ],
  totals: {
    subtotalExclVatHalalas: 750000,
    totalVatHalalas: 7500,
    grandTotalHalalas: 757500,
  },
  qrCodeData: undefined,
  zatcaStatus: 'cleared',
  notes: 'شامل التأشيرة وتذاكر الطيران والإقامة في فنادق قريبة من الحرم المكي.',
};

export default function PrintInvoicePage({ params }: { params: { locale: string; id: string } }) {
  // In production: fetch from Firestore by params.id
  if (params.id !== 'INV-001' && params.id !== 'INV-2026-000248') notFound();

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <PrintableInvoice invoice={DEMO_INVOICE_DATA} />
    </div>
  );
}
