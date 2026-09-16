ALTER TABLE "invoices" ADD COLUMN "credited_halalas" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "cancelled_halalas" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "invoices" AS original
SET "credited_halalas" = GREATEST(
      original."credited_halalas",
      LEAST(original."total_halalas", credits.total_credit)
    ),
    "cancelled_halalas" = CASE
      WHEN original."status" = 'refunded' THEN original."total_halalas"
      ELSE GREATEST(
        original."cancelled_halalas",
        LEAST(original."total_halalas", credits.total_credit)
      )
    END
FROM (
  SELECT "original_invoice_id", COALESCE(SUM("total_halalas"), 0)::bigint AS total_credit
  FROM "invoices"
  WHERE "type" = '381'
    AND "status" <> 'cancelled'
    AND "original_invoice_id" IS NOT NULL
  GROUP BY "original_invoice_id"
) AS credits
WHERE original."id" = credits."original_invoice_id";--> statement-breakpoint
UPDATE "invoices"
SET "cancelled_halalas" = "total_halalas"
WHERE "status" = 'refunded'
  AND "cancelled_halalas" < "total_halalas";
