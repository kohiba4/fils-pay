package settlement

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/filspay/settlement/internal/money"
)

// UpdateLifetimePayoutMonitoringEstimate maintains the ops dashboard
// running payout total on the merchant row. Not payout-affecting, but integer fils
// like every other money value (AUD-033: it used to be a float32 that dropped small
// payouts once the total was large).
func UpdateLifetimePayoutMonitoringEstimate(ctx context.Context, tx pgx.Tx, merchantID uuid.UUID, netPayoutFils money.Fils) error {
	_, err := tx.Exec(ctx, `
		UPDATE merchants
		   SET lifetime_net_payout_monitoring_estimate = lifetime_net_payout_monitoring_estimate + $2
		 WHERE id = $1
	`, merchantID, int64(netPayoutFils))
	return err
}

// EstimateMonthlyPayout returns an approximate total payout for the
// given merchant over the last 30 calendar days, used by the ops
// dashboard to flag merchants whose settlement run is unusually large
// or small relative to their recent history. Like
// UpdateLifetimePayoutMonitoringEstimate, this is a monitoring-only
// figure that never feeds into any payout-affecting code path. The sum is
// exact integer fils (computed by the database, no float accumulator).
func EstimateMonthlyPayout(ctx context.Context, tx pgx.Tx, merchantID uuid.UUID) (money.Fils, error) {
	var total int64
	err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(net_payout_fils), 0)::bigint FROM settlement_batches
		 WHERE merchant_id = $1 AND status = 'paid' AND paid_at >= now() - interval '30 days'
	`, merchantID).Scan(&total)
	if err != nil {
		return 0, err
	}
	return money.Fils(total), nil
}
