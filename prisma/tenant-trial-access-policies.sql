-- Targeted policy deployment for the additive trial-access migration.
-- Apply only after verified billing writers are converted; see change design D2.
-- The canonical rls-policies.sql contains the same security contract.
ALTER TABLE public.tenant_trial_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_trial_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_trial_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_billing_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_trial_grants, public.tenant_trial_operations,
  public.tenant_trial_notifications, public.tenant_billing_risks,
  public.admin_audit_events FROM PUBLIC, anon, authenticated;

-- Column SELECT privileges keep operator/provider identifiers off the Data API.
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

REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
-- Clear historical column-level grants as well as table-level privileges.
REVOKE INSERT (id, "userId", "stripeCustomerId", stripe_subscription_id, stripe_price_id,
  subscription_current_period_start, subscription_current_period_end, subscription_cancel_at,
  subscription_cancel_at_period_end, latest_stripe_event_created_at, pending_downgrade_tier,
  stripe_schedule_id, "subscriptionTier", "subscriptionStatus", trial_ends_at,
  billing_access_version, pending_trial_operation_id, onboarding_completed_at, display_name,
  "createdAt", "updatedAt") ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, "userId", "stripeCustomerId", stripe_subscription_id, stripe_price_id,
  subscription_current_period_start, subscription_current_period_end, subscription_cancel_at,
  subscription_cancel_at_period_end, latest_stripe_event_created_at, pending_downgrade_tier,
  stripe_schedule_id, "subscriptionTier", "subscriptionStatus", trial_ends_at,
  billing_access_version, pending_trial_operation_id, onboarding_completed_at, display_name,
  "createdAt", "updatedAt") ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (display_name, onboarding_completed_at, "updatedAt")
  ON TABLE public.user_profiles TO authenticated;