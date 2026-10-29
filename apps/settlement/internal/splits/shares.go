package splits

import (
	"errors"
	"math"
	"sort"

	"github.com/filspay/settlement/internal/money"
)

// totalWeightBps is the whole payout: a parent's children must sum to exactly 100%.
const totalWeightBps int64 = 10_000

// ErrInvalidSplitWeights is returned when a parent's child weights are not all positive or do not sum
// to exactly 10,000 bps. Paying out anyway would strand (or invent) money, so the batch is left unpaid.
var ErrInvalidSplitWeights = errors.New("splits: child weights must be positive and sum to 10000 bps")

// ChildWeight is one sub-merchant's configured share of a parent's payout.
type ChildWeight struct {
	WeightBps int64
}

// ChildShares distributes netPayout across children by their weights using the largest-remainder
// method (a Go port of allocateRemainder in packages/money): every share is the floor of its exact
// proportion, and the fils left over go one each to the largest fractional remainders, ties to the
// lowest index. The shares therefore always sum to exactly netPayout (AUD-009: independent per-child
// rounding used to lose or invent up to a fil per batch). netPayout must be >= 0.
func ChildShares(netPayout money.Fils, children []ChildWeight) ([]money.Fils, error) {
	if len(children) == 0 || netPayout < 0 {
		return nil, ErrInvalidSplitWeights
	}
	var sum int64
	for _, c := range children {
		if c.WeightBps <= 0 {
			return nil, ErrInvalidSplitWeights
		}
		sum += c.WeightBps
	}
	if sum != totalWeightBps {
		return nil, ErrInvalidSplitWeights
	}
	net := int64(netPayout)
	if net > math.MaxInt64/totalWeightBps {
		return nil, errors.New("splits: net payout too large to allocate exactly")
	}

	shares := make([]money.Fils, len(children))
	remainders := make([]int64, len(children))
	var allocated int64
	for i, c := range children {
		product := net * c.WeightBps
		base := product / totalWeightBps
		shares[i] = money.Fils(base)
		remainders[i] = product % totalWeightBps
		allocated += base
	}

	order := make([]int, len(children))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool { return remainders[order[a]] > remainders[order[b]] })
	for k := 0; k < int(net-allocated); k++ { // leftover < len(children)
		shares[order[k]]++
	}
	return shares, nil
}
