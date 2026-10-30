#!/usr/bin/env bash
# Crash-recovery test, run ON THE SERVER: load the checkout scenario, SIGKILL the API in the middle (no graceful shutdown),
# time how long until /readyz answers again, then check the data for integrity (nothing acknowledged is lost, nothing is
# half-written). Usage: sudo bash recovery.sh <loadtest dir> <base url> <key file>
set -euo pipefail
DIR=${1:?}; BASE=${2:?}; KEY=${3:?}
LOG=$(mktemp)
sudo -u filspay -H /usr/local/bin/node "$DIR/checkout.mjs" --base "$BASE" --key-file "$KEY" --levels 20 --seconds 25 > "$LOG" 2>&1 &
LOADPID=$!
sleep 9
T0=$(date +%s.%N)
echo "SIGKILL filspay-api at +9 s (restart policy: Restart=always, RestartSec=2)"
kill -9 "$(systemctl show -p MainPID --value filspay-api)"
until curl -fsS -m 1 http://127.0.0.1:3000/readyz >/dev/null 2>&1; do sleep 0.1; done
T1=$(date +%s.%N)
printf "API ready again after %.1f s (new pid %s)\n" "$(echo "$T1 - $T0" | bc)" "$(systemctl show -p MainPID --value filspay-api)"
wait $LOADPID || true
echo "--- load during the crash (errors are connection errors/5xx while the API was down, then it continues):"
grep -o '"codes".*' "$LOG" | head -1 | cut -c1-300
echo "--- integrity after the crash:"
sudo -u postgres psql filspay -tAc "select 'unbalanced ledger groups: ' || count(*) from (select entry_group_id from ledger_entries group by 1 having sum(case direction when 'debit' then amount_fils else -amount_fils end) <> 0) x"
sudo -u postgres psql filspay -tAc "select 'captured transactions whose captured amount differs from their ledger gross credit: ' || count(*) from transactions t where t.captured_fils > 0 and t.captured_fils <> coalesce((select sum(amount_fils) from ledger_entries l where l.transaction_id = t.id and l.description = 'capture: gross' and l.direction = 'credit'), 0)"
sudo -u postgres psql filspay -tAc "select 'capture events without a matching ledger credit: ' || count(*) from transaction_events e where e.event_type in ('captured','partially_captured') and not exists (select 1 from ledger_entries l where l.transaction_id = e.transaction_id and l.description = 'capture: gross')"
sudo -u postgres psql filspay -tAc "select 'idempotency keys stuck in_progress older than 1 minute: ' || count(*) from idempotency_keys where status = 'in_progress' and created_at < now() - interval '1 minute'"
sudo -u postgres psql filspay -tAc "select 'ledger total debit minus credit (must be 0): ' || coalesce(sum(case direction when 'debit' then amount_fils else -amount_fils end),0) from ledger_entries"
