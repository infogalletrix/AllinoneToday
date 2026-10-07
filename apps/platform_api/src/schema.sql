CREATE TABLE IF NOT EXISTS accounts (
 id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, phone text NOT NULL DEFAULT '',
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('buyer','merchant','admin')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shops (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id), name text NOT NULL,
 category text NOT NULL, branches integer NOT NULL CHECK(branches BETWEEN 1 AND 100),
 location text NOT NULL, phone text NOT NULL, description text NOT NULL DEFAULT '', image_path text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending_payment', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_plans (
 price_key text PRIMARY KEY, provider_plan_id text NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id), account_id uuid NOT NULL REFERENCES accounts(id),
 provider_id text UNIQUE, amount_minor integer NOT NULL, currency text NOT NULL DEFAULT 'INR', period text NOT NULL,
 quote jsonb NOT NULL, status text NOT NULL DEFAULT 'creating', payment_id text,
 paid_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_events (
 id text PRIMARY KEY, event text NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS listings (
 id uuid PRIMARY KEY, seller_id uuid NOT NULL REFERENCES accounts(id), shop_id uuid REFERENCES shops(id),
 title text NOT NULL, price numeric(14,2) NOT NULL CHECK(price >= 0), formatted_price text NOT NULL,
 location text NOT NULL, category text NOT NULL, subcategory text NOT NULL DEFAULT '',
 image_path text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active', specifications jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_category_date ON listings(category, created_at DESC);
CREATE TABLE IF NOT EXISTS inquiries (
 id uuid PRIMARY KEY, listing_id uuid REFERENCES listings(id), shop_id uuid REFERENCES shops(id),
 sender_id uuid NOT NULL REFERENCES accounts(id), recipient_id uuid NOT NULL REFERENCES accounts(id),
 sender_name text NOT NULL, phone text NOT NULL, message text NOT NULL,
 preferred_date text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
 id uuid PRIMARY KEY, inquiry_id uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES accounts(id), content text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS favorites (
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 PRIMARY KEY(account_id, listing_id)
);
CREATE TABLE IF NOT EXISTS uploads (
 path text PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reports (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), listing_id uuid NOT NULL REFERENCES listings(id),
 reason text NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_access ON subscriptions(shop_id,paid_until);
CREATE INDEX IF NOT EXISTS session_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS blocks (
 account_id uuid NOT NULL REFERENCES accounts(id), blocked_id uuid NOT NULL REFERENCES accounts(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,blocked_id)
);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS password_set boolean NOT NULL DEFAULT true;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'password';
CREATE TABLE IF NOT EXISTS marketplace_categories (
 id text PRIMARY KEY, name text UNIQUE NOT NULL, slug text UNIQUE NOT NULL,
 subtitle text NOT NULL DEFAULT '', image_path text NOT NULL DEFAULT '',
 position integer NOT NULL DEFAULT 0, enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS platform_settings (
 key text PRIMARY KEY, value jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_audit (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES accounts(id),
 action text NOT NULL, target text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_handoffs (
 code_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id),
 expires_at timestamptz NOT NULL, auth_method text NOT NULL DEFAULT 'password'
);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT 'small';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS expected_photos integer NOT NULL DEFAULT 100;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS moderated_hidden boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS shop_assessments (
 shop_id uuid PRIMARY KEY REFERENCES shops(id), status text NOT NULL DEFAULT 'pending',
 suggestion jsonb, approved_amount_minor integer, reason text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
