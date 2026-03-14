-- 021_disputes_notifications.sql
-- Match disputes and notification system for the competition platform.

-- Match disputes
CREATE TABLE IF NOT EXISTS public.match_disputes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES public.bracket_matches(id) ON DELETE CASCADE,
  competition_id  uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  filed_by        text NOT NULL,
  reason          text NOT NULL,
  evidence_url    text,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'under_review', 'resolved_upheld', 'resolved_denied', 'withdrawn')),
  resolution_note text,
  resolved_by     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_match_disputes_match ON public.match_disputes (match_id);
CREATE INDEX IF NOT EXISTS idx_match_disputes_comp ON public.match_disputes (competition_id);
CREATE INDEX IF NOT EXISTS idx_match_disputes_status ON public.match_disputes (status) WHERE status = 'open';

-- Notifications table (for notification worker)
CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet          text NOT NULL,
  type            text NOT NULL CHECK (type IN (
    'match_upcoming', 'match_result', 'competition_started', 'competition_completed',
    'registration_confirmed', 'dispute_filed', 'dispute_resolved', 'achievement_earned'
  )),
  title           text NOT NULL,
  body            text,
  data            jsonb NOT NULL DEFAULT '{}',
  read            boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_wallet ON public.notifications (wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications (wallet) WHERE read = false;
