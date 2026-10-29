-- FP-300 / AUD-004, AUD-005: a database-level backstop for the refund ceiling. Application code (processRefund) holds
-- the transaction row lock and bounds a refund by captured - refunded; this makes a bug or a manual write that would
-- refund more than was captured fail loudly instead of silently creating money.
-- Refunds were never live before this change, so no existing row can violate it; the VALIDATE step fails the migration
-- (rather than hiding the problem) if one somehow does.
ALTER TABLE transactions
    ADD CONSTRAINT chk_transactions_refunded_not_above_captured
    CHECK (refunded_fils <= captured_fils) NOT VALID;
ALTER TABLE transactions VALIDATE CONSTRAINT chk_transactions_refunded_not_above_captured;
