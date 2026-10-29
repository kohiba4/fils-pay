-- AUD-017: platform_stats.total_processed_fils is a lifetime total in FILS. It was INTEGER (max
-- 2,147,483,647 fils, about 2.15M BD) although code comments claimed BIGINT, and the volume-tier
-- threshold is 2,000,000,000 fils: only ~147M fils of headroom before the Go side wrapped negative
-- and silently switched the tier discount off. Widen to BIGINT (single-row table, instant).
ALTER TABLE platform_stats ALTER COLUMN total_processed_fils TYPE BIGINT;
