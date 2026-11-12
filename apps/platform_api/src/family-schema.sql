-- Additive migration. Review state is never inferred from publication/payment.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('allinonetoday-family-schema-v1'));
CREATE TABLE IF NOT EXISTS platform_schema_migrations (
 key text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE marketplace_categories ADD COLUMN IF NOT EXISTS family_safe boolean NOT NULL DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS family_safe boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS family_safe boolean NOT NULL DEFAULT false;
-- Anonymous structured safety reports contain public target IDs and fixed
-- reasons only. Never persist request IP, age, device, session or account IDs.
CREATE TABLE IF NOT EXISTS family_content_reports (
 id uuid PRIMARY KEY,
 target_type text NOT NULL CHECK(target_type IN ('categories','shops','listings')),
 target_id text NOT NULL,
 reason text NOT NULL CHECK(reason IN ('unsafe','inappropriate','misleading','other')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),
 removed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS family_reports_queue ON family_content_reports(status,created_at DESC);
CREATE OR REPLACE FUNCTION revoke_family_review_on_content_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- This deliberately includes status, contact and source image changes. Even
 -- historical clients and direct operator updates cannot retain stale approval.
 IF (to_jsonb(NEW)-'family_safe') IS DISTINCT FROM (to_jsonb(OLD)-'family_safe') THEN
  NEW.family_safe := false;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS revoke_family_category_review ON marketplace_categories;
CREATE TRIGGER revoke_family_category_review BEFORE UPDATE ON marketplace_categories FOR EACH ROW EXECUTE FUNCTION revoke_family_review_on_content_change();
DROP TRIGGER IF EXISTS revoke_family_shop_review ON shops;
CREATE TRIGGER revoke_family_shop_review BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION revoke_family_review_on_content_change();
DROP TRIGGER IF EXISTS revoke_family_listing_review ON listings;
CREATE TRIGGER revoke_family_listing_review BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION revoke_family_review_on_content_change();
-- Only the six original catalogue identities with their exact curated text and
-- bundled images are seeded once. Renamed categories and all shops/listings
-- require explicit review. Re-running this migration never reapproves content.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_schema_migrations WHERE key='family-review-v1') THEN
  UPDATE marketplace_categories c SET family_safe=true FROM (VALUES
   ('cat_vehicles','Vehicles','vehicles','Car, bike & commercial','/images/h1.png','product'),
   ('cat_groceries','Groceries','groceries','Fresh vegetables & produce','/images/h4.png','product'),
   ('cat_electronics','Electronics','electronics','Laptops, audio & appliances','/images/h5.png','product'),
   ('cat_mobiles','Mobiles','mobiles','Phones, tablets & accessories','/images/h6.png','product'),
   ('cat_services','Services','services','Home, repair & cleaning','/images/h7.png','service'),
   ('cat_furniture','Furniture','furniture','Living, bed & dining','/images/h8.png','product')
  ) AS curated(id,name,slug,subtitle,image_path,module)
  WHERE c.id=curated.id AND c.name=curated.name AND c.slug=curated.slug
   AND c.subtitle=curated.subtitle AND c.image_path=curated.image_path
   AND c.module=curated.module AND c.enabled=true;
  INSERT INTO platform_schema_migrations(key) VALUES('family-review-v1');
 END IF;
END $$;
COMMIT;
