-- Migration 011: reminders table
--
-- Lightweight reminder/notification system.
-- Users can request email notifications for challenge proof events.
-- A cron or worker process reads pending reminders and sends emails.

CREATE TABLE IF NOT EXISTS public.reminders (
  id            bigserial    PRIMARY KEY,
  email         text         NOT NULL,
  challenge_id  bigint       NOT NULL REFERENCES public.challenges(id),
  type          text         NOT NULL CHECK (type IN ('proof_window_open', 'proof_closing_soon', 'verification_complete')),
  sent          boolean      NOT NULL DEFAULT false,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  sent_at       timestamptz
);

-- Prevent duplicate reminders for the same email + challenge + type
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_unique
  ON public.reminders (lower(email), challenge_id, type);

-- Fast lookup for the worker: unsent reminders
CREATE INDEX IF NOT EXISTS idx_reminders_pending
  ON public.reminders (sent, challenge_id) WHERE sent = false;
