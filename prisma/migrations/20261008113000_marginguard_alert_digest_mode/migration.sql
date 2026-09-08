ALTER TABLE "public"."margin_guard_settings"
ADD COLUMN "alert_digest_mode" TEXT NOT NULL DEFAULT 'daily';
