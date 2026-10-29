-- AUD-033: lifetime_net_payout_monitoring_estimate was REAL (float32): above 2^24 fils (about 16,777 BD)
-- it cannot represent every integer, and adding a small payout to a large total is silently lost.
-- Money is integer fils (ADR-0001), so the column becomes BIGINT. The column name is kept (nothing else reads it).
-- Values already drifted are rebuilt exactly from the paid batches; merchants without paid batches keep
-- their (rounded) value.
ALTER TABLE merchants
    ALTER COLUMN lifetime_net_payout_monitoring_estimate TYPE BIGINT
    USING round(lifetime_net_payout_monitoring_estimate)::bigint;

UPDATE merchants m
   SET lifetime_net_payout_monitoring_estimate = s.total
  FROM (SELECT merchant_id, SUM(net_payout_fils)::bigint AS total
          FROM settlement_batches WHERE status = 'paid' GROUP BY merchant_id) s
 WHERE s.merchant_id = m.id;
