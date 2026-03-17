-- 022_user_profiles.sql
-- User profiles with avatar storage and display preferences.
-- Avatars stored as bytea (JPEG, max ~200KB after server-side resize).

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  wallet         text PRIMARY KEY,          -- lowercase 0x... address
  display_name   text,                      -- optional friendly name
  bio            text,                      -- short bio (max 500 chars)
  avatar         bytea,                     -- JPEG image data (resized server-side)
  avatar_mime    text DEFAULT 'image/jpeg', -- MIME type
  avatar_hash    text,                      -- SHA-256 of avatar for ETag/caching
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by wallet (PK already covers this)
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated
  ON public.user_profiles (updated_at DESC);

-- Track schema migration
INSERT INTO public.schema_migrations (version) VALUES ('022')
  ON CONFLICT DO NOTHING;

COMMIT;
