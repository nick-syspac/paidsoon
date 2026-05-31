import { PrismaClient } from "@/lib/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

/**
 * prismaAdmin — bypasses Row Level Security.
 *
 * Only use in code paths that operate without a user session:
 *   - the email-dispatch cron
 *   - Stripe webhook handlers
 *   - post-signup profile/schedule bootstrap (runs before the user has a JWT)
 *
 * For any request made on behalf of a signed-in user, use
 * `withUserContext(user.id, (tx) => ...)` from `@/lib/db/withUserContext`
 * instead, so RLS applies.
 */

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })
}

const globalForPrisma = globalThis as unknown as { prismaAdmin: PrismaClient }

export const prismaAdmin = globalForPrisma.prismaAdmin ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaAdmin = prismaAdmin
