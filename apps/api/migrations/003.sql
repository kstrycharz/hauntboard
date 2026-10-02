ALTER TABLE jobs ADD COLUMN reserved_at timestamptz;
UPDATE jobs SET reserved_at=created_at WHERE max_fee IS NOT NULL;
CREATE INDEX jobs_reservation_day ON jobs(reserved_at) WHERE reserved_at IS NOT NULL;
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
