UPDATE "invoices"
SET "status" = CASE
      WHEN "credited_halalas" >= "total_halalas" THEN 'credit_noted'
      ELSE 'paid'
    END,
    "updated_at" = NOW()
WHERE "type" IN ('380', '388')
  AND "status" IN ('issued', 'partial', 'overdue', 'paid')
  AND "credited_halalas" > 0
  AND "paid_halalas" + "credited_halalas" >= "total_halalas"
  AND "status" IS DISTINCT FROM CASE
        WHEN "credited_halalas" >= "total_halalas" THEN 'credit_noted'
        ELSE 'paid'
      END;
