-- PaidSoon — dashboard auth table grants hotfix
--
-- Purpose:
--   Fix environments where authenticated-role queries fail with:
--   "permission denied for table user_profiles",
--   "permission denied for table invoice_connections", or
--   "permission denied for table tracked_invoices", or
--   "permission denied for table tax_buffer_configurations", or
--   "permission denied for table commit_guard_settings", or
--   "permission denied for table cost_guard_alerts", or
--   "permission denied for table accounting_connections", or
--   "permission denied for table schedules", or
--   "permission denied for table invoice_import_batches", or
--   "permission denied for table cost_guard_settings", or
--   "permission denied for table margin_guard_settings", or
--   "permission denied for table imported_bank_transactions", or
--   "permission denied for table owners_digest_settings", or
--   "permission denied for table deposit_guard_jobs", or
--   "permission denied for table cost_guard_forecasts", or
--   "permission denied for table financial_payments".
--
-- Run this in Supabase SQL Editor for the affected environment.

BEGIN;

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE user_profiles TO authenticated;
ALTER TABLE invoice_connections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE invoice_connections TO authenticated;
ALTER TABLE tracked_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE tracked_invoices TO authenticated;
ALTER TABLE financial_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE financial_invoices TO authenticated;
ALTER TABLE financial_contacts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE financial_contacts TO authenticated;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE email_logs TO authenticated;
ALTER TABLE promise_to_pay ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE promise_to_pay TO authenticated;
ALTER TABLE promise_escalation_policies ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE promise_escalation_policies TO authenticated;
ALTER TABLE arrangement_invoice_coverages ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE arrangement_invoice_coverages TO authenticated;
ALTER TABLE arrangements ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE arrangements TO authenticated;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE invoice_payments TO authenticated;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE customers TO authenticated;
ALTER TABLE tax_buffer_configurations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE tax_buffer_configurations TO authenticated;
ALTER TABLE tax_reserve_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE tax_reserve_categories TO authenticated;
ALTER TABLE tax_buffer_obligations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE tax_buffer_obligations TO authenticated;
ALTER TABLE tax_buffer_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE tax_buffer_snapshots TO authenticated;
ALTER TABLE tax_buffer_overrides ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE tax_buffer_overrides TO authenticated;
ALTER TABLE tax_buffer_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE tax_buffer_events TO authenticated;
ALTER TABLE imported_bills ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE imported_bills TO authenticated;
ALTER TABLE cash_forecast_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE cash_forecast_snapshots TO authenticated;
ALTER TABLE cash_plan_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE cash_plan_snapshots TO authenticated;
ALTER TABLE cash_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE cash_plans TO authenticated;
ALTER TABLE commit_guard_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE commit_guard_settings TO authenticated;
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE commitments TO authenticated;
ALTER TABLE commitment_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE commitment_events TO authenticated;
ALTER TABLE commitment_detection_candidates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE commitment_detection_candidates TO authenticated;
ALTER TABLE cost_guard_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE cost_guard_alerts TO authenticated;
ALTER TABLE runway_guard_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE runway_guard_settings TO authenticated;
ALTER TABLE runway_guard_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE runway_guard_snapshots TO authenticated;
ALTER TABLE cash_plan_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE cash_plan_settings TO authenticated;
ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting_connections TO authenticated;
ALTER TABLE accounting_sync_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE accounting_sync_runs TO authenticated;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON TABLE oauth_states TO authenticated;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE schedules TO authenticated;
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE email_settings TO authenticated;
ALTER TABLE invoice_import_batches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE invoice_import_batches TO authenticated;
ALTER TABLE spend_import_batches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE spend_import_batches TO authenticated;
ALTER TABLE cost_guard_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE cost_guard_settings TO authenticated;
ALTER TABLE margin_guard_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE margin_guard_settings TO authenticated;
ALTER TABLE margin_guard_targets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE margin_guard_targets TO authenticated;
ALTER TABLE margin_classification_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE margin_classification_rules TO authenticated;
ALTER TABLE margin_cost_classifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE margin_cost_classifications TO authenticated;
ALTER TABLE margin_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE margin_alerts TO authenticated;
ALTER TABLE margin_alert_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE margin_alert_events TO authenticated;
ALTER TABLE margin_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE margin_snapshots TO authenticated;
ALTER TABLE margin_scenarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE margin_scenarios TO authenticated;
ALTER TABLE margin_opportunities ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE margin_opportunities TO authenticated;
ALTER TABLE imported_bank_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE imported_bank_transactions TO authenticated;
ALTER TABLE supplier_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE supplier_profiles TO authenticated;
ALTER TABLE owners_digest_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE owners_digest_settings TO authenticated;
ALTER TABLE owners_digest_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE owners_digest_snapshots TO authenticated;
ALTER TABLE owners_digest_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON TABLE owners_digest_items TO authenticated;
ALTER TABLE owners_digest_metrics ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON TABLE owners_digest_metrics TO authenticated;
ALTER TABLE owners_digest_provider_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON TABLE owners_digest_provider_runs TO authenticated;
ALTER TABLE owners_digest_deliveries ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE owners_digest_deliveries TO authenticated;
ALTER TABLE deposit_guard_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE deposit_guard_jobs TO authenticated;
ALTER TABLE deposit_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE deposit_requests TO authenticated;
ALTER TABLE payment_milestones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment_milestones TO authenticated;
ALTER TABLE deposit_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE deposit_payments TO authenticated;
ALTER TABLE deposit_reminders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposit_reminders TO authenticated;
ALTER TABLE deposit_guard_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE deposit_guard_events TO authenticated;
ALTER TABLE deposit_guard_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE deposit_guard_settings TO authenticated;
ALTER TABLE spend_insights ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON TABLE spend_insights TO authenticated;
ALTER TABLE cost_guard_forecasts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE cost_guard_forecasts TO authenticated;
ALTER TABLE cost_guard_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE cost_guard_rules TO authenticated;
ALTER TABLE cost_guard_baselines ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE cost_guard_baselines TO authenticated;
ALTER TABLE cost_guard_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON TABLE cost_guard_alerts TO authenticated;
ALTER TABLE cost_guard_alert_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE cost_guard_alert_events TO authenticated;
ALTER TABLE financial_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE financial_payments TO authenticated;

COMMIT;
