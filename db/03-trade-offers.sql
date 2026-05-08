BEGIN;

CREATE SEQUENCE IF NOT EXISTS trade_offer_sequence START 1;

CREATE TABLE IF NOT EXISTS trade_offers (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES collector_profiles(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES user_albums(id) ON DELETE CASCADE,
  give_kind TEXT NOT NULL CHECK (give_kind IN ('sticker', 'duplicate', 'missing')),
  give_country_code TEXT,
  give_sticker_number INTEGER,
  want_kind TEXT NOT NULL CHECK (want_kind IN ('sticker', 'duplicate', 'missing')),
  want_country_code TEXT,
  want_sticker_number INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_confirmation','accepted_pending_completion','completed','cancelled','expired')),
  reserved_by_owner_id UUID REFERENCES collector_profiles(id),
  reserved_collection_id UUID REFERENCES user_albums(id),
  resolved_give_country_code TEXT,
  resolved_give_sticker_number INTEGER,
  resolved_want_country_code TEXT,
  resolved_want_sticker_number INTEGER,
  owner_confirmed_at TIMESTAMPTZ,
  taker_confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
