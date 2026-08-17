-- Growth referral program schema (trimmed down from the real thing).
-- Every file in sql/ is applied in filename order when the test database boots,
-- so you can add a 002_*.sql migration if you want to change the schema.

CREATE TABLE organizations (
  id          text PRIMARY KEY,
  name        text NOT NULL
);

-- One row per referral. A referral is created when org A invites org B,
-- and converts when org B signs their first contract.
CREATE TABLE referrals (
  id               text PRIMARY KEY,
  referrer_org_id  text NOT NULL REFERENCES organizations (id),
  referred_org_id  text NOT NULL REFERENCES organizations (id),
  status           text NOT NULL DEFAULT 'pending',   -- pending | converted | expired
  created_at       timestamptz NOT NULL DEFAULT now(),
  converted_at     timestamptz
);

-- Account credit granted to the referrer. This is money, so it shows up on
-- the referrer's next invoice.
CREATE TABLE reward_credits (
  id            text PRIMARY KEY,
  org_id        text NOT NULL REFERENCES organizations (id),
  referral_id   text NOT NULL REFERENCES referrals (id),
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);
