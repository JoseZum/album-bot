BEGIN;

CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_collector_id UUID NOT NULL REFERENCES collector_profiles(id) ON DELETE CASCADE,
  to_collector_id UUID NOT NULL REFERENCES collector_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  CHECK (from_collector_id <> to_collector_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_requests_pending_pair
  ON friend_requests (
    LEAST(from_collector_id, to_collector_id),
    GREATEST(from_collector_id, to_collector_id)
  )
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_friend_requests_to_status
  ON friend_requests(to_collector_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS collector_friends (
  collector_id UUID NOT NULL REFERENCES collector_profiles(id) ON DELETE CASCADE,
  friend_collector_id UUID NOT NULL REFERENCES collector_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collector_id, friend_collector_id),
  CHECK (collector_id <> friend_collector_id)
);

CREATE INDEX IF NOT EXISTS idx_collector_friends_friend
  ON collector_friends(friend_collector_id);

COMMIT;
