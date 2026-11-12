-- Optional additive-schema rollback after the API image has been rolled back.
-- Catalogue/account/subscription records are never modified by this rollback.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('allinonetoday-catalogue-version-v1'));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['shops','listings','accounts','marketplace_categories','subscriptions','platform_settings'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS catalogue_revision_before ON %I',t);
  EXECUTE format('DROP TRIGGER IF EXISTS catalogue_revision_after ON %I',t);
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS catalogue_revision_commit ON catalogue_revision_queue;
DROP FUNCTION IF EXISTS track_catalogue_change();
DROP FUNCTION IF EXISTS commit_catalogue_revision();
DROP FUNCTION IF EXISTS queue_catalogue_revision(boolean,boolean);
DROP TABLE IF EXISTS catalogue_revision_queue;
DROP TABLE IF EXISTS catalogue_revisions;
COMMIT;
