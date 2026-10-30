-- FP-300 PR 3 (Track B, uncommitted): refunds in reporting.
--
-- 1. merchant_daily_volume gains refund columns. The reporting consumer's
--    applyDailySummaryRollup already wrote refund_count / refund_gross_fils,
--    but the columns never existed, so any refund event would have failed the
--    whole reporting pass. Bucketed by the Asia/Bahrain date like the rest of
--    the table (0027, decision Q6).
ALTER TABLE merchant_daily_volume
    ADD COLUMN IF NOT EXISTS refund_count      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refund_gross_fils BIGINT  NOT NULL DEFAULT 0;

-- 2. AUD-028: 0072's refund_merchant_summary joined `t.id = r.id` (a refund id
--    against a transaction id), so it was always empty, and summed the
--    transaction's captured_fils once per refund. Rebuilt with the right join;
--    original_captured_fils counts each refunded transaction once per day.
--    Nothing reads the view today (grep of apps/ and scripts/).
DROP MATERIALIZED VIEW IF EXISTS refund_merchant_summary;

CREATE MATERIALIZED VIEW refund_merchant_summary AS
WITH per_day AS (
    SELECT r.merchant_id,
           date_trunc('day', r.occurred_at AT TIME ZONE 'Asia/Bahrain') AS business_date,
           r.transaction_id,
           COUNT(*)                 AS refund_count,
           SUM(r.amount_fils)       AS refunded_fils,
           SUM(r.fee_reversed_fils) AS fee_reversed_fils
      FROM refunds r
     WHERE r.status = 'succeeded'
     GROUP BY r.merchant_id, date_trunc('day', r.occurred_at AT TIME ZONE 'Asia/Bahrain'), r.transaction_id
)
SELECT p.merchant_id,
       p.business_date,
       SUM(p.refund_count)::bigint     AS refund_count,
       SUM(p.refunded_fils)::bigint    AS total_refunded_fils,
       SUM(p.fee_reversed_fils)::bigint AS total_fee_reversed_fils,
       SUM(t.captured_fils)::bigint    AS original_captured_fils
  FROM per_day p
  JOIN transactions t ON t.id = p.transaction_id
 GROUP BY p.merchant_id, p.business_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_merchant_summary_pk
    ON refund_merchant_summary (merchant_id, business_date);
