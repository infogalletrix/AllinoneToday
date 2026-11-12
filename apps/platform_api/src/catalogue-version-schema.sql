-- Additive, transaction-safe revision metadata. No catalogue/owner values are
-- stored here. Reads are O(1); visibility work runs only when content changes.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('allinonetoday-catalogue-version-v1'));
CREATE TABLE IF NOT EXISTS catalogue_revisions (
 scope text PRIMARY KEY CHECK(scope IN ('public','family')),
 epoch text NOT NULL DEFAULT md5(random()::text||clock_timestamp()::text),
 revision bigint NOT NULL DEFAULT 0
);
INSERT INTO catalogue_revisions(scope) VALUES('public'),('family') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS catalogue_revision_queue (
 transaction_id bigint PRIMARY KEY,
 public_changed boolean NOT NULL,
 family_changed boolean NOT NULL
);

CREATE OR REPLACE FUNCTION queue_catalogue_revision(p_public boolean,p_family boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT p_public AND NOT p_family THEN RETURN; END IF;
 INSERT INTO catalogue_revision_queue(transaction_id,public_changed,family_changed)
 VALUES(txid_current(),p_public OR p_family,p_family)
 ON CONFLICT(transaction_id) DO UPDATE SET
  public_changed=catalogue_revision_queue.public_changed OR EXCLUDED.public_changed,
  family_changed=catalogue_revision_queue.family_changed OR EXCLUDED.family_changed;
END $$;

CREATE OR REPLACE FUNCTION commit_catalogue_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE flags catalogue_revision_queue%ROWTYPE;
BEGIN
 SELECT * INTO flags FROM catalogue_revision_queue WHERE transaction_id=NEW.transaction_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Always acquire these locks in the same order, after all catalogue DML.
 IF flags.public_changed THEN UPDATE catalogue_revisions SET revision=revision+1 WHERE scope='public'; END IF;
 IF flags.family_changed THEN UPDATE catalogue_revisions SET revision=revision+1 WHERE scope='family'; END IF;
 DELETE FROM catalogue_revision_queue WHERE transaction_id=NEW.transaction_id;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS catalogue_revision_commit ON catalogue_revision_queue;
CREATE CONSTRAINT TRIGGER catalogue_revision_commit AFTER INSERT ON catalogue_revision_queue
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commit_catalogue_revision();

CREATE OR REPLACE FUNCTION track_catalogue_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_id uuid; category_id text; p boolean:=false; f boolean:=false; only_name boolean:=false;
BEGIN
 IF TG_TABLE_NAME='platform_settings' THEN
  IF TG_OP='UPDATE' AND OLD.value IS NOT DISTINCT FROM NEW.value THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF (TG_OP<>'INSERT' AND OLD.key='website') OR (TG_OP<>'DELETE' AND NEW.key='website') THEN PERFORM queue_catalogue_revision(true,false); END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 ELSIF TG_TABLE_NAME='accounts' THEN
  -- A dependency update must invalidate even when its statement snapshot has
  -- no related rows: another transaction can commit a candidate before this
  -- dependency transaction commits. Private password/session changes skip it.
  IF TG_OP<>'UPDATE' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='UPDATE' THEN
   IF ROW(OLD.role,OLD.suspended,OLD.name) IS NOT DISTINCT FROM ROW(NEW.role,NEW.suspended,NEW.name) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
   only_name:=ROW(OLD.role,OLD.suspended) IS NOT DISTINCT FROM ROW(NEW.role,NEW.suspended);
  END IF;
  item_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  IF only_name THEN
   p:=true;
  ELSE
   p:=true;f:=true;
  END IF;
 ELSIF TG_TABLE_NAME='marketplace_categories' THEN
  IF TG_OP='UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='UPDATE' THEN
   PERFORM queue_catalogue_revision(true,true);
   RETURN NEW;
  END IF;
  category_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  SELECT EXISTS(SELECT 1 FROM marketplace_categories c WHERE c.id=category_id AND __categoryVisible__) INTO p;
  SELECT EXISTS(SELECT 1 FROM marketplace_categories c WHERE c.id=category_id AND c.family_safe=true AND __categoryVisible__) INTO f;
 ELSIF TG_TABLE_NAME='subscriptions' THEN
  IF TG_OP='UPDATE' AND ROW(OLD.shop_id,OLD.paid_until) IS NOT DISTINCT FROM ROW(NEW.shop_id,NEW.paid_until) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF (TG_OP='INSERT' AND (NEW.paid_until IS NULL OR NEW.paid_until<=now())) OR (TG_OP='DELETE' AND (OLD.paid_until IS NULL OR OLD.paid_until<=now())) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  item_id:=CASE WHEN TG_OP='DELETE' OR TG_WHEN='BEFORE' AND TG_OP='UPDATE' THEN OLD.shop_id ELSE NEW.shop_id END;
  p:=true;f:=true;
 ELSIF TG_TABLE_NAME='shops' THEN
  IF TG_OP='UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  item_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  SELECT EXISTS(SELECT 1 FROM shops s WHERE s.id=item_id AND s.status='active' AND s.moderated_hidden=false) INTO p;
  SELECT EXISTS(SELECT 1 FROM shops s WHERE s.id=item_id AND s.family_safe=true) INTO f;
 ELSIF TG_TABLE_NAME='listings' THEN
  IF TG_OP='UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  item_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  -- Normal shops expose an active-listing count independently of list filters.
  SELECT EXISTS(SELECT 1 FROM listings l WHERE l.id=item_id AND l.status='active') INTO p;
  SELECT EXISTS(SELECT 1 FROM listings l WHERE l.id=item_id AND l.family_safe=true) INTO f;
 END IF;
 PERFORM queue_catalogue_revision(p,f);
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

-- BEFORE observes old flags; AFTER observes saved flags. Candidate checks are
-- deliberately conservative: joining every current dependency could miss an
-- active row insertion concurrent with owner unsuspension/category enable.
-- Extra opaque invalidations never broaden the actual catalogue read policy.
-- These triggers only touch a row owned by the current transaction. The shared
-- revision rows are updated by the deferred queue trigger at commit, preventing
-- catalogue-row/revision-row lock inversion in multi-table writes.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['shops','listings','accounts','marketplace_categories','subscriptions','platform_settings'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS catalogue_revision_before ON %I',t);
  EXECUTE format('DROP TRIGGER IF EXISTS catalogue_revision_after ON %I',t);
  EXECUTE format('CREATE TRIGGER catalogue_revision_before BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION track_catalogue_change()',t);
  EXECUTE format('CREATE TRIGGER catalogue_revision_after AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION track_catalogue_change()',t);
 END LOOP;
END $$;
COMMIT;
