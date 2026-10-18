-- Approved development containment: ONLY the four additive trial-access tables.
-- Does not activate profile-column restrictions or modify existing audit tables.
-- Full rollout still requires tenant-trial-access-policies.sql after writer conversion.
BEGIN;
ALTER TABLE public.tenant_trial_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_trial_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_trial_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_billing_risks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_trial_grants, public.tenant_trial_operations,
  public.tenant_trial_notifications, public.tenant_billing_risks
  FROM PUBLIC, anon, authenticated;

GRANT SELECT (id, user_id, plan, starts_at, expires_at, revoked_at, created_at, updated_at)
  ON TABLE public.tenant_trial_grants TO authenticated;
GRANT SELECT (id, user_id, kind, stripe_status, blocking, reconciled_at)
  ON TABLE public.tenant_billing_risks TO authenticated;

DROP POLICY IF EXISTS "tenant reads own trial grant" ON public.tenant_trial_grants;
CREATE POLICY "tenant reads own trial grant" ON public.tenant_trial_grants
  FOR SELECT TO authenticated USING ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "tenant reads own billing risk" ON public.tenant_billing_risks;
CREATE POLICY "tenant reads own billing risk" ON public.tenant_billing_risks
  FOR SELECT TO authenticated USING ((SELECT auth.uid())::text = user_id);
COMMIT;