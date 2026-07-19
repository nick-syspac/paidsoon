import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma } from "@/lib/generated/prisma/client"

export type PrismaTx = Prisma.TransactionClient

/**
 * Runs `fn` inside a transaction where Postgres RLS is active and
 * `auth.uid()` resolves to `userId`.
 *
 * Implementation notes:
 *   - `set_config(..., true)` and `SET LOCAL ROLE` are transaction-scoped,
 *     so settings cannot leak across requests sharing a pooled connection.
 *   - The role is set before JWT claim GUCs so the effective role observes
 *     the same transaction-local auth context used for all subsequent queries.
 *   - Both `request.jwt.claims` and `request.jwt.claim.*` are set so the
 *     helper works across Supabase/PostgREST auth.uid() claim lookups.
 *   - The connection role configured in `DATABASE_URL` must be permitted
 *     to `SET ROLE authenticated` (Supabase: connect as `authenticator`
 *     or a custom role granted `authenticated`).
 *
 * Every user-scoped Prisma access should go through this helper. Service
 * paths (cron, webhooks) use `prismaAdmin` directly.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: PrismaTx) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" })
  return prismaAdmin.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`)
    await tx.$executeRawUnsafe(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      claims,
    )
    await tx.$executeRawUnsafe(
      `SELECT set_config('request.jwt.claim.sub', $1, true)`,
      userId,
    )
    await tx.$executeRawUnsafe(
      `SELECT set_config('request.jwt.claim.role', 'authenticated', true)`,
    )
    return fn(tx as unknown as PrismaTx)
  })
}
