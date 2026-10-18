import "server-only"
import type { Prisma } from "@/lib/generated/prisma/client"

/** Shared coordinator lock; acquire before authoritative tenant billing reads/writes. */
export async function lockTenantBilling(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `billing-access:${userId}`)
}