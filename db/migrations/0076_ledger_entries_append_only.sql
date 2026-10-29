-- AUD-034: make ledger_entries genuinely append-only.
--
-- Migration 0007 said the deferred balance trigger also made the ledger immutable ("an edited or removed
-- leg unbalances its group and the commit is rejected; no separate reject trigger or REVOKE is needed").
-- That only holds for changes that unbalance a group. Deleting BOTH legs of a group (it sums to 0), or
-- shifting both legs by the same amount, commits fine, so history could be rewritten silently.
--
-- Nothing in the application updates or deletes ledger rows (corrections are new balanced groups), so any
-- UPDATE or DELETE is rejected. TRUNCATE is deliberately NOT blocked here: the dev seed resets tables
-- with TRUNCATE ... CASCADE; production should additionally REVOKE TRUNCATE (and UPDATE/DELETE) from the
-- application role. NOT a defence against a database superuser or the table owner: they can still
-- `DISABLE TRIGGER`, `SET session_replication_role = replica`, or TRUNCATE. A deliberate repair must be done by the table owner with
-- `ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_append_only` inside a reviewed change.
CREATE FUNCTION reject_ledger_entries_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ledger_entries is append-only: % is not allowed (post a correcting group instead)', TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_entries_mutation();
