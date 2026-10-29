package config

import "testing"

func withEnv(t *testing.T, kv map[string]string) {
	t.Helper()
	for k, v := range kv {
		t.Setenv(k, v)
	}
}

func TestLoad_DatabaseURLRequired(t *testing.T) {
	withEnv(t, map[string]string{"DATABASE_URL": ""})
	if _, err := Load(); err == nil {
		t.Fatal("expected an error when DATABASE_URL is unset")
	}
}

func TestLoad_UsesDatabaseURLByDefault(t *testing.T) {
	withEnv(t, map[string]string{"DATABASE_URL": "postgres://a/db", "PGCONN_SETTLEMENT": ""})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DatabaseURL != "postgres://a/db" {
		t.Fatalf("expected DatabaseURL to be DATABASE_URL's value, got %q", cfg.DatabaseURL)
	}
}

// FH: came in with 'test: config' (b64cd3c). it locks in the override, doesn't say the override is right
// MK: it's right.
func TestLoad_PgconnSettlementOverridesWhenSet(t *testing.T) {
	withEnv(t, map[string]string{
		"DATABASE_URL":      "postgres://a/db",
		"PGCONN_SETTLEMENT": "postgres://b/settlement-replica",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DatabaseURL != "postgres://b/settlement-replica" {
		t.Fatalf("expected the PGCONN_SETTLEMENT override to win, got %q", cfg.DatabaseURL)
	}
}

// AUD-025: an out-of-range close delay used to be accepted and could silently stop the daily close.
func TestLoad_RejectsOutOfRangeRunDelay(t *testing.T) {
	for _, bad := range []string{"-1", "1440", "1500"} {
		withEnv(t, map[string]string{"DATABASE_URL": "postgres://a/db", "SETTLEMENT_DAEMON_RUN_DELAY_MINUTES": bad})
		if _, err := Load(); err == nil {
			t.Errorf("SETTLEMENT_DAEMON_RUN_DELAY_MINUTES=%s: expected an error", bad)
		}
	}
	for _, ok := range []string{"0", "15", "1439"} {
		withEnv(t, map[string]string{"DATABASE_URL": "postgres://a/db", "SETTLEMENT_DAEMON_RUN_DELAY_MINUTES": ok})
		if _, err := Load(); err != nil {
			t.Errorf("SETTLEMENT_DAEMON_RUN_DELAY_MINUTES=%s: unexpected error %v", ok, err)
		}
	}
}
