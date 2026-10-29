-- AUD-036: fingerprint of an import's parsed content (merchant, amount in fils, reason; order independent),
-- so the same file submitted twice (double click, retry, another filename) can be refused.
-- NOT unique on purpose: finance may repeat an identical file deliberately (allowDuplicate); the check
-- runs in the importing transaction under an advisory lock. NULL for imports made before this migration.
ALTER TABLE adjustment_imports ADD COLUMN content_sha256 TEXT;
CREATE INDEX idx_adjustment_imports_content_sha256 ON adjustment_imports (content_sha256) WHERE content_sha256 IS NOT NULL;
