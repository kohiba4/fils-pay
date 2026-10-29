package settlement

import "github.com/filspay/settlement/internal/money"

// NetPayableFils derives the net payout from frozen gross and fee totals.
// Pure integer subtraction (ADR-0001): fils never pass through a float, which
// cannot represent every fils value above ~16,000 BD (AUD-008).
func NetPayableFils(grossFils, feeFils money.Fils) money.Fils {
	return grossFils - feeFils
}
