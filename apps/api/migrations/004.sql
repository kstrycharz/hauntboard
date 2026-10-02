CREATE TABLE participants(id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE curator ADD COLUMN pin_login_hash text UNIQUE, ADD COLUMN pin_salt text, ADD COLUMN pin_hash text, ADD COLUMN pin_failures integer NOT NULL DEFAULT 0, ADD COLUMN pin_locked_until timestamptz;
ALTER TABLE sessions ADD COLUMN auth_method text NOT NULL DEFAULT 'passkey' CHECK(auth_method IN ('pin','passkey'));
ALTER TABLE participants ADD COLUMN pin_login_hash text UNIQUE, ADD COLUMN pin_salt text, ADD COLUMN pin_hash text, ADD COLUMN pin_failures integer NOT NULL DEFAULT 0, ADD COLUMN pin_locked_until timestamptz;
CREATE TABLE participant_passkeys(id text PRIMARY KEY, participant_id uuid NOT NULL REFERENCES participants(id), public_key bytea NOT NULL, counter bigint NOT NULL CHECK(counter>=0), transports jsonb NOT NULL);
CREATE TABLE participant_ceremonies(id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('register','login')), participant_id uuid, challenge text NOT NULL, consumed boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL);
CREATE TABLE participant_sessions(token_hash text PRIMARY KEY, participant_id uuid NOT NULL REFERENCES participants(id), csrf_hash text NOT NULL, expires_at timestamptz NOT NULL);
INSERT INTO schema_migrations(version) VALUES(4);
