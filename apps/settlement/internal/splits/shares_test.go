package splits

import (
	"testing"

	"github.com/filspay/settlement/internal/money"
)

func TestChildShares_SumToNet(t *testing.T) {
	cases := []struct {
		name       string
		netPayout  money.Fils
		weightsBps []int64
	}{
		{"two equal", 10000, []int64{5000, 5000}},
		{"three round", 9000, []int64{3000, 3000, 4000}},
		{"single child", 5000, []int64{10000}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			children := make([]ChildWeight, len(tc.weightsBps))
			for i, w := range tc.weightsBps {
				children[i] = ChildWeight{WeightBps: w}
			}
			shares, err := ChildShares(tc.netPayout, children)
			if err != nil {
				t.Fatalf("ChildShares: %v", err)
			}
			var total money.Fils
			for _, s := range shares {
				total += s
			}
			if total != tc.netPayout {
				t.Errorf("sum of shares %d != net payout %d", total, tc.netPayout)
			}
		})
	}
}

// AUD-009: the cases above are "nice" numbers where independent per-child rounding happens to sum
// exactly, so they passed while production lost or invented fils. These do not.
func TestChildShares_AwkwardNetsSumExactly(t *testing.T) {
	weightSets := [][]int64{{5000, 3000, 2000}, {3333, 3333, 3334}, {1, 9999}, {2500, 2500, 2500, 2500}, {10000}}
	for _, ws := range weightSets {
		children := make([]ChildWeight, len(ws))
		for i, w := range ws {
			children[i] = ChildWeight{WeightBps: w}
		}
		for net := money.Fils(0); net <= 3000; net++ {
			shares, err := ChildShares(net, children)
			if err != nil {
				t.Fatalf("weights %v net %d: %v", ws, net, err)
			}
			var total money.Fils
			for i, sh := range shares {
				if sh < 0 {
					t.Fatalf("weights %v net %d: negative share %d", ws, net, sh)
				}
				exactFloor := money.Fils(int64(net) * ws[i] / 10_000)
				if sh < exactFloor || sh > exactFloor+1 {
					t.Fatalf("weights %v net %d share %d = %d, want %d or %d", ws, net, i, sh, exactFloor, exactFloor+1)
				}
				total += sh
			}
			if total != net {
				t.Fatalf("weights %v net %d: shares %v sum to %d", ws, net, shares, total)
			}
		}
	}
}

func TestChildShares_LargestRemainderGetsTheExtraFil(t *testing.T) {
	// 1001 * (5000, 3000, 2000) / 10000 = 500.5, 300.3, 200.2 -> the .5 remainder wins the spare fil.
	shares, err := ChildShares(1001, []ChildWeight{{5000}, {3000}, {2000}})
	if err != nil {
		t.Fatal(err)
	}
	if want := []money.Fils{501, 300, 200}; shares[0] != want[0] || shares[1] != want[1] || shares[2] != want[2] {
		t.Fatalf("shares = %v, want %v", shares, want)
	}
}

func TestChildShares_RejectsBadWeights(t *testing.T) {
	for _, ws := range [][]ChildWeight{{}, {{5000}, {3000}}, {{6000}, {6000}}, {{10001}}, {{0}, {10000}}, {{-5}, {10005}}} {
		if _, err := ChildShares(1000, ws); err != ErrInvalidSplitWeights {
			t.Errorf("weights %v: err = %v, want ErrInvalidSplitWeights", ws, err)
		}
	}
}
