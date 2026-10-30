-- TOTP (RFC 6238) second login factor for both planes. Replaces the emailed/shown OTP in production (SECOND_FACTOR=totp).
-- The secret is stored encrypted (AES-256-GCM, same key as webhook secrets), never in clear.
ALTER TABLE merchant_users
    ADD COLUMN totp_secret_ciphertext TEXT,
    ADD COLUMN totp_confirmed_at      TIMESTAMPTZ,
    ADD COLUMN totp_last_step         BIGINT,
    ADD COLUMN totp_failed_count      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN totp_locked_until      TIMESTAMPTZ;
ALTER TABLE admin_users
    ADD COLUMN totp_secret_ciphertext TEXT,
    ADD COLUMN totp_confirmed_at      TIMESTAMPTZ,
    ADD COLUMN totp_last_step         BIGINT,
    ADD COLUMN totp_failed_count      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN totp_locked_until      TIMESTAMPTZ;
-- wrong codes tried on one pending session (budget of 5; a pending session has no OTP challenge row in TOTP mode)
ALTER TABLE sessions       ADD COLUMN totp_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_sessions ADD COLUMN totp_attempt_count INTEGER NOT NULL DEFAULT 0;
