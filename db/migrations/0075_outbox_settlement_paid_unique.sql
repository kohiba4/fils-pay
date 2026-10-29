-- AUD-018: at most ONE settlement.paid outbox event per settlement batch.
--
-- EnqueuePayoutNotifications checked "NOT EXISTS" and then inserted; the daemon and the run-batch CLI (or
-- two overlapping ticks) both passed the check and both inserted, so merchants got two "your payout is on
-- the way" webhooks. A comment in the code claimed a unique index on (event_type, aggregate_id) already
-- existed; it never did.
--
-- Historical duplicates may already exist (webhook_deliveries reference those rows, so they are NOT
-- deleted or rewritten here), and a plain unique index would fail to build on such a database. The index
-- therefore only covers events created after this migration (ids above the current maximum). The insert
-- uses a bare ON CONFLICT DO NOTHING, which applies to this index without naming its predicate.
DO $$
DECLARE
    last_id BIGINT;
BEGIN
    SELECT COALESCE(MAX(id), 0) INTO last_id FROM outbox_events;
    EXECUTE format(
        'CREATE UNIQUE INDEX uq_outbox_settlement_paid_per_batch
             ON outbox_events (aggregate_id)
          WHERE event_type = ''settlement.paid'' AND id > %s',
        last_id
    );
END
$$;
