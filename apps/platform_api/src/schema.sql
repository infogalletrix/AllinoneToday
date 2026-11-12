CREATE TABLE IF NOT EXISTS accounts (
 id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, phone text NOT NULL DEFAULT '',
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('buyer','merchant','admin','support')),
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
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner_temporary_password text;
CREATE UNIQUE INDEX IF NOT EXISTS account_user_id_unique ON accounts(lower(user_id)) WHERE user_id IS NOT NULL;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS provisioned_by uuid REFERENCES accounts(id);
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
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_role_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_role_check CHECK(role IN ('buyer','merchant','admin','support'));
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_name text NOT NULL DEFAULT '';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS shop_type text NOT NULL DEFAULT 'Retail / General Store';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS branch_details jsonb NOT NULL DEFAULT '[]';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gallery jsonb NOT NULL DEFAULT '[]';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS branch_id uuid;
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id),
 inquiry_id uuid REFERENCES inquiries(id) ON DELETE CASCADE,
 title text NOT NULL, body text NOT NULL, read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_account_date ON notifications(account_id,created_at DESC);
CREATE TABLE IF NOT EXISTS email_outbox (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id),
 template text NOT NULL CHECK(template IN ('welcome','enquiry','reply')),
 dedupe_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz, sent_at timestamptz, last_error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_outbox_pending ON email_outbox(status,next_attempt_at);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'product';
ALTER TABLE marketplace_categories ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'product';
UPDATE marketplace_categories SET module='job' WHERE slug='jobs' AND module='product';
UPDATE marketplace_categories SET module='service' WHERE slug='services' AND module='product';
UPDATE listings SET kind='job' WHERE category='Jobs' AND kind='product';
UPDATE listings SET kind='service' WHERE category='Services' AND kind='product';
CREATE TABLE IF NOT EXISTS activity_events (
 id uuid PRIMARY KEY, actor_id uuid REFERENCES accounts(id), action text NOT NULL,
 route text NOT NULL, status integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_tickets (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id),
 assigned_support_id uuid NOT NULL REFERENCES accounts(id), subject text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_messages (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES accounts(id), content text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS password_resets (
 token_hash text PRIMARY KEY, account_id uuid NOT NULL UNIQUE REFERENCES accounts(id),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0
);
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_template_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_check CHECK(template IN ('welcome','enquiry','reply','storage_alert','support_alert','password_changed'));

-- Account and conversation reports retain their original context for moderation.
ALTER TABLE reports ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_account_id uuid REFERENCES accounts(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS inquiry_id uuid REFERENCES inquiries(id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='reports_context_check' AND conrelid='reports'::regclass) THEN
  ALTER TABLE reports ADD CONSTRAINT reports_context_check CHECK (
   (listing_id IS NOT NULL AND inquiry_id IS NULL) OR
   (listing_id IS NULL AND inquiry_id IS NOT NULL AND target_account_id IS NOT NULL)
  );
 END IF;
END $$;
