import type { BookingLine } from '@/lib/schema';
import { inferZatcaExemptionReason } from '@/lib/zatca-einvoice';
import type { ZatcaVatCategory, ZatcaExemptionReason } from '@masarat/zatca';

export interface InvoiceItem {
  description:      string;
  descriptionEn:    string | null;
  quantity:         number;
  unitPriceHalalas: number;
  vatHalalas:       number;
  totalHalalas:     number;
  vatCategory?:     ZatcaVatCategory;
  exemptionReason?: ZatcaExemptionReason;
}

export function buildInvoiceItemsFromLines(
  lines: BookingLine[],
  isVatRegistered: boolean,
  bookingServiceType: string | null,
  isInternational: boolean,
): InvoiceItem[] {
  return lines.flatMap(line => {
    const lineVat = isVatRegistered ? line.vatHalalas : 0;
    const vatCategory = isVatRegistered ? (line.vatCategory as ZatcaVatCategory) : undefined;
    const exemptionReason = vatCategory
      ? inferZatcaExemptionReason(vatCategory, line.serviceType, bookingServiceType, isInternational)
      : undefined;

    // An agent collects the supplier amount on the supplier's behalf and earns
    // only the fee. On a VAT invoice these must be separate lines: the supplier
    // pass-through is outside scope (O), while only the agency fee is standard
    // rated. Keeping them in one S line would advertise 15% on the full ticket /
    // hotel amount while charging VAT only on the fee — an invalid ZATCA line.
    if (isVatRegistered && line.revenueModel === 'agent') {
      const passThrough = Math.min(line.totalCostHalalas, line.totalPriceExclVatHalalas);
      const fee         = Math.max(0, line.totalPriceExclVatHalalas - passThrough);
      const items: InvoiceItem[] = [];
      if (passThrough > 0) {
        items.push({
          description:      `${line.description} — مبلغ المورد`,
          descriptionEn:    null,
          quantity:         1,
          unitPriceHalalas: passThrough,
          vatHalalas:       0,
          totalHalalas:     passThrough,
          vatCategory:      'O',
        });
      }
      if (fee > 0 || lineVat > 0) {
        items.push({
          description:      `${line.description} — رسوم الوكالة`,
          descriptionEn:    null,
          quantity:         1,
          unitPriceHalalas: fee,
          vatHalalas:       lineVat,
          totalHalalas:     fee + lineVat,
          vatCategory,
          exemptionReason,
        });
      }
      return items;
    }

    return [{
      description:      line.description,
      descriptionEn:    null,
      quantity:         line.quantity,
      unitPriceHalalas: line.unitPriceExclVatHalalas,
      vatHalalas:       lineVat,
      totalHalalas:     line.totalPriceExclVatHalalas + lineVat,
      vatCategory,
      exemptionReason,
    }];
  });
}
