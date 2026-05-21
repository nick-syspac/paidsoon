import { prisma } from "@/lib/prisma"

export async function requirePro(userId: string): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { subscriptionTier: true },
  })
  return profile?.subscriptionTier === "pro"
}

export async function getSubscriptionTier(
  userId: string
): Promise<"free" | "pro"> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { subscriptionTier: true },
  })
  return (profile?.subscriptionTier as "free" | "pro") ?? "free"
}

export const FREE_TIER_INVOICE_LIMIT = 3
