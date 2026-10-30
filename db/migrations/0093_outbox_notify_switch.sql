-- Capacity: the outbox trigger (0021) sends pg_notify INSIDE the business transaction. Postgres serialises the commit of every
-- transaction that sent a notification behind one database-wide lock, held until the commit (and its disk flush) completes,
-- so concurrent checkouts committed one at a time (measured: ~15 checkouts/s on the 1 vCPU box, Lock/object waits, COMMIT
-- dominating pg_stat_activity). NOTIFY is only a latency optimisation: the dispatcher and the reporting consumer both poll.
-- The trigger now honours the database setting `filspay.outbox_notify`; any value but 'off' (including unset) keeps the old
-- behaviour, so tests and development are unchanged. Production sets it to 'off' (deploy/remote/provision.sh) and polls faster.
CREATE OR REPLACE FUNCTION notify_outbox_event() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('filspay.outbox_notify', true), 'on') <> 'off' THEN
    PERFORM pg_notify('outbox_events_channel', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
