-- Amount and recipient remain together inside the authenticated encrypted intent.
ALTER TABLE reward_quotes DROP COLUMN amount;
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
