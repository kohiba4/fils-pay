-- Convenience views used by the API and admin dashboard.
--
-- AUD-026: this file originally also created `v_unbatched_capture_events`, which
-- selected from `settlement_batch_events` — a table that exists in no migration
-- (it belonged to the abandoned settlement-v2 branch, ADR-0005). That made the
-- whole file fail on any fresh database, so 0054+ could never be applied.
-- The broken view was removed; nothing in the repo reads it. Databases that
-- already recorded this filename are unaffected (db/migrate.ts skips by name).

CREATE OR REPLACE VIEW merchant_payable_position AS
SELECT sb.merchant_id,
       COALESCE(SUM(sel.amount_fils), 0) AS payable_fils
  FROM scheme_export_lines sel
  JOIN settlement_batches sb ON sb.id = sel.settlement_batch_id
 GROUP BY sb.merchant_id;

CREATE OR REPLACE VIEW v_active_api_keys AS
SELECT ak.id,
       ak.merchant_id,
       ak.key_prefix,
       ak.created_at,
       ak.label
  FROM api_keys ak
 WHERE ak.revoked_at IS NULL;
