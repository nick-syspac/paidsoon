-- Allow lifecycle updates performed through Prisma, which also updates updated_at.
REVOKE UPDATE ON TABLE "spend_insights" FROM authenticated;
GRANT UPDATE ("state", "resolved_at", "updated_at") ON TABLE "spend_insights" TO authenticated;
