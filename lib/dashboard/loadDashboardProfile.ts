import { cache } from "react"
import { withUserContext } from "@/lib/db/withUserContext"
import type { UserProfile } from "@/lib/generated/prisma/client"

export const getDashboardProfile = cache(async (userId: string): Promise<UserProfile | null> =>
  withUserContext(userId, (tx) =>
    tx.userProfile.findUnique({ where: { userId } }),
  ),
)