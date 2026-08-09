-- Restrict authenticated updates on spend insights to lifecycle columns only.
REVOKE UPDATE ON TABLE "spend_insights" FROM authenticated;
GRANT UPDATE ("state", "resolved_at") ON TABLE "spend_insights" TO authenticated;
