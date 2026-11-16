CREATE TABLE IF NOT EXISTS sb_users(id text PRIMARY KEY, username text UNIQUE NOT NULL, name text NOT NULL, role text NOT NULL CHECK(role IN ('admin','seller')), enabled boolean NOT NULL DEFAULT true, password text NOT NULL);
CREATE TABLE IF NOT EXISTS sb_sessions(token text PRIMARY KEY,user_id text REFERENCES sb_users(id) ON DELETE CASCADE,expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS sb_store(id int PRIMARY KEY CHECK(id=1),revision int NOT NULL DEFAULT 0,data jsonb NOT NULL,policy jsonb NOT NULL DEFAULT '{"admin":100,"seller":0}');
INSERT INTO sb_store(id,data) VALUES(1,'{"items":[],"kardex":[],"receipts":[],"savedReports":[],"negocio":"SMARTBOD","telefono":""}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS sb_attempts(key text PRIMARY KEY,count int NOT NULL,until_time timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS sb_audit(id bigserial PRIMARY KEY,at timestamptz NOT NULL DEFAULT now(),user_id text,action text NOT NULL,revision int);

CREATE TABLE IF NOT EXISTS sb_images(id text PRIMARY KEY,content bytea NOT NULL,mime text NOT NULL,created timestamptz NOT NULL DEFAULT now());
