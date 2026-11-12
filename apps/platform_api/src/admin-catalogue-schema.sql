-- Additive only. Existing merchant content/financial access stays unchanged.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS admin_managed boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS admin_managed boolean NOT NULL DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_amount_minor integer DEFAULT NULL;
