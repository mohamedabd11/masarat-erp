import { BusinessError } from './api-auth';
import { calculateRefundTax, type RefundTaxResult } from './refund-tax';
import type { ZatcaRecordItem } from './zatca-einvoice';

export interface RefundDocumentItem extends ZatcaRecordItem {
  descriptionEn: string | null;
}

export interface RefundDocumentInput {
  originalItems?:          ZatcaRecordItem[];
  originalTotalHalalas:    number;
  originalVatHalalas:      number;
  cancelledTotalHalalas:   number;
  cancellationFeeHalalas:  number;
  isEInvoice:              boolean;
  /** Statutory rate captured on the booking line: 1500 = 15%. */
  vatRateBps:              number;
}

export interface RefundDocumentResult extends RefundTaxResult {
  /** Exact credit-note lines, preserving S/Z/E/O tax categories when available. */
  items?: RefundDocumentItem[];
}

/**
 * Build the monetary totals and optional item breakdown for a refund credit note.
 *
 * Agent invoices need this breakdown because their supplier pass-through is
 * outside scope (O), while only the agency fee is standard-rated (S). A single
 * aggregate line would apply the advertised VAT rate to the wrong base.
 */
export function buildRefundDocument(input: RefundDocumentInput): RefundDocumentResult {
  const tax = calculateRefundTax(input);
  const originalItems = input.originalItems;
  if (!originalItems || originalItems.length === 0) {
    // Aggregate fallback is safe only when the original invoice itself is a
    // single standard-rated supply. Mixed/agent invoices require stored lines.
    if (input.isEInvoice && input.originalVatHalalas > 0) {
      const originalSubtotal = input.originalTotalHalalas - input.originalVatHalalas;
      const expectedVat = Math.round(originalSubtotal * input.vatRateBps / 10_000);
      if (Math.abs(expectedVat - input.originalVatHalalas) > 1) {
        throw new BusinessError(
          'لا تتوفر تفاصيل ضريبية كافية لإصدار إشعار دائن صحيح لهذه الفاتورة القديمة',
          422,
        );
      }
    }
    return tax;
  }

  validateOriginalItems(input, originalItems);

  const cancelledGross = allocateExact(
    input.cancelledTotalHalalas,
    originalItems.map(item => item.totalHalalas),
  );
  const cancelledVat = allocateExact(
    tax.cancelledOriginalVatHalalas,
    originalItems.map(item => item.vatHalalas),
  );
  const cancelledSubtotal = cancelledGross.map((gross, index) => gross - cancelledVat[index]!);

  if (cancelledSubtotal.some(value => value < 0)) {
    throw new BusinessError('تعذّر توزيع ضريبة الجزء الملغى على بنود الفاتورة', 422);
  }

  if (input.cancellationFeeHalalas > 0) {
    const eligible = originalItems
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => {
        const category = item.vatCategory ?? (item.vatHalalas > 0 ? 'S' : 'Z');
        return input.isEInvoice
          ? category === 'S' && cancelledGross[index]! > 0
          : cancelledSubtotal[index]! > 0;
      })
      .map(({ index }) => index);

    const availableVat = eligible.reduce((sum, index) => sum + cancelledVat[index]!, 0);
    const availableSubtotal = eligible.reduce((sum, index) => sum + cancelledSubtotal[index]!, 0);
    if (availableVat < tax.cancellationFeeVatHalalas
        || availableSubtotal < tax.cancellationFeeNetHalalas) {
      throw new BusinessError(
        'رسوم الإلغاء تتجاوز الجزء الخاضع للضريبة في الإلغاء؛ يلزم إصدار فاتورة مستقلة للرسوم',
        422,
      );
    }

    const feeVatParts = allocateExact(
      tax.cancellationFeeVatHalalas,
      eligible.map(index => cancelledVat[index]!),
    );
    const feeNetParts = allocateExact(
      tax.cancellationFeeNetHalalas,
      eligible.map(index => cancelledSubtotal[index]!),
    );
    eligible.forEach((index, partIndex) => {
      cancelledVat[index]! -= feeVatParts[partIndex]!;
      cancelledSubtotal[index]! -= feeNetParts[partIndex]!;
      cancelledGross[index]! = cancelledSubtotal[index]! + cancelledVat[index]!;
    });
  }

  const items: RefundDocumentItem[] = originalItems.flatMap((item, index) => {
    const total = cancelledGross[index]!;
    if (total <= 0) return [];
    return [{
      description:      item.description,
      descriptionEn:    null,
      quantity:         1,
      unitPriceHalalas: cancelledSubtotal[index]!,
      vatHalalas:       cancelledVat[index]!,
      totalHalalas:     total,
      vatCategory:      item.vatCategory,
      exemptionReason:  item.exemptionReason,
    }];
  });

  const itemTotal = items.reduce((sum, item) => sum + item.totalHalalas, 0);
  const itemVat = items.reduce((sum, item) => sum + item.vatHalalas, 0);
  if (itemTotal !== tax.creditNoteTotalHalalas || itemVat !== tax.creditNoteVatHalalas) {
    throw new BusinessError('تعذّر موازنة بنود الإشعار الدائن مع إجمالياته', 422);
  }

  return { ...tax, items };
}

function validateOriginalItems(input: RefundDocumentInput, items: ZatcaRecordItem[]): void {
  const total = items.reduce((sum, item) => sum + item.totalHalalas, 0);
  const vat = items.reduce((sum, item) => sum + item.vatHalalas, 0);
  if (total !== input.originalTotalHalalas || vat !== input.originalVatHalalas) {
    throw new BusinessError('بنود الفاتورة الأصلية لا تطابق إجمالياتها', 422);
  }

  for (const item of items) {
    if (!Number.isInteger(item.totalHalalas) || !Number.isInteger(item.vatHalalas)
        || item.totalHalalas < 0 || item.vatHalalas < 0 || item.vatHalalas > item.totalHalalas) {
      throw new BusinessError('أحد بنود الفاتورة الأصلية غير صالح', 422);
    }
    if (!input.isEInvoice) continue;

    const category = item.vatCategory ?? (item.vatHalalas > 0 ? 'S' : 'Z');
    const subtotal = item.totalHalalas - item.vatHalalas;
    if (category === 'S') {
      const expectedVat = Math.round(subtotal * input.vatRateBps / 10_000);
      if (Math.abs(expectedVat - item.vatHalalas) > 1) {
        throw new BusinessError(
          'بند ضريبي قديم لا يوضح مبلغ المورد ورسوم الوكالة بصورة منفصلة',
          422,
        );
      }
    } else if (item.vatHalalas !== 0) {
      throw new BusinessError('بند غير خاضع يحتوي ضريبة غير صالحة', 422);
    }
  }
}

/** Allocate an integer total pro-rata while preserving the exact target sum. */
function allocateExact(total: number, weights: number[]): number[] {
  if (total === 0) return weights.map(() => 0);
  const weightTotal = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (weightTotal <= 0) {
    throw new BusinessError('تعذّر توزيع قيمة الاسترداد على بنود الفاتورة', 422);
  }

  const raw = weights.map(weight => total * Math.max(0, weight) / weightTotal);
  const allocated = raw.map(value => Math.floor(value));
  let remainder = total - allocated.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i++) {
    allocated[order[i % order.length]!.index]! += 1;
  }
  return allocated;
}
