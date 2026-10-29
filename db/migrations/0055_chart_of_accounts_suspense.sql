-- AUD-026: intentionally a no-op.
--
-- This file originally inserted `fx_rounding_difference` and
-- `chargeback_suspense` into chart_of_accounts using columns that do not exist
-- (`code`, `account_type`, `description`) and a kind (`suspense`) that the
-- chart_of_accounts CHECK (0007) forbids, so it failed on every fresh database.
-- No code reads either account. If a suspense account is needed later, add it
-- in a new migration with the real columns (id, name, kind).
DO $$ BEGIN NULL; END $$;
