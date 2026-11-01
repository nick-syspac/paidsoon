-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "account_display_from_date" DATE,
ADD COLUMN     "account_display_revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "account_display_time_zone" TEXT NOT NULL DEFAULT 'Australia/Melbourne';

-- CreateTable
CREATE TABLE "account_display_settings" (
    "user_id" TEXT NOT NULL,
    "display_from_date" DATE,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "time_zone" TEXT NOT NULL DEFAULT 'Australia/Melbourne',
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL
);

-- CreateTable
CREATE TABLE "account_display_setting_audits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "old_display_from_date" DATE,
    "new_display_from_date" DATE,
    "old_revision" INTEGER NOT NULL,
    "new_revision" INTEGER NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_display_setting_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_display_settings_user_id_key" ON "account_display_settings"("user_id");

-- CreateIndex
CREATE INDEX "account_display_setting_audits_user_id_created_at_idx" ON "account_display_setting_audits"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "account_display_settings" ADD CONSTRAINT "account_display_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_display_setting_audits" ADD CONSTRAINT "account_display_setting_audits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account_display_settings"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.account_display_settings
  ADD CONSTRAINT account_display_settings_revision_check CHECK (revision >= 0);

CREATE OR REPLACE FUNCTION public.account_display_setting_revision_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.display_from_date IS NULL THEN
      NEW.revision := 0;
      RETURN NEW;
    END IF;

    NEW.revision := 1;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.display_from_date IS NOT DISTINCT FROM OLD.display_from_date THEN
      NEW.revision := OLD.revision;
      RETURN NEW;
    END IF;

    NEW.revision := OLD.revision + 1;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.account_display_setting_revision_assignment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.account_display_setting_audit_writer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_user_id text;
BEGIN
  v_actor_user_id := auth.uid()::text;

  IF TG_OP = 'INSERT' THEN
    IF NEW.display_from_date IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.account_display_setting_audits (
      id, user_id, old_display_from_date, new_display_from_date,
      old_revision, new_revision, actor_user_id, created_at
    )
    VALUES (
      md5(random()::text || clock_timestamp()::text || NEW.user_id),
      NEW.user_id,
      NULL,
      NEW.display_from_date,
      0,
      NEW.revision,
      v_actor_user_id,
      NOW()
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.display_from_date IS NOT DISTINCT FROM OLD.display_from_date THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.account_display_setting_audits (
      id, user_id, old_display_from_date, new_display_from_date,
      old_revision, new_revision, actor_user_id, created_at
    )
    VALUES (
      md5(random()::text || clock_timestamp()::text || NEW.user_id || NEW.display_from_date::text),
      NEW.user_id,
      OLD.display_from_date,
      NEW.display_from_date,
      OLD.revision,
      NEW.revision,
      v_actor_user_id,
      NOW()
    );

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.account_display_setting_audit_writer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS account_display_setting_revision_assignment ON public.account_display_settings;
CREATE TRIGGER account_display_setting_revision_assignment
BEFORE INSERT OR UPDATE OF display_from_date
ON public.account_display_settings
FOR EACH ROW EXECUTE FUNCTION public.account_display_setting_revision_assignment();

DROP TRIGGER IF EXISTS account_display_setting_audit_writer ON public.account_display_settings;
CREATE TRIGGER account_display_setting_audit_writer
AFTER INSERT OR UPDATE OF display_from_date
ON public.account_display_settings
FOR EACH ROW EXECUTE FUNCTION public.account_display_setting_audit_writer();
