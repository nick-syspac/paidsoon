"use server"

import { prismaAdmin as prisma } from "@/lib/db/admin"

export async function createUserProfile(userId: string) {
  // Creates user_profiles and default schedules record for a new user.
  // Called after Supabase confirms a new user — idempotent (upsert).
  await prisma.$transaction([
    prisma.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
    prisma.schedule.upsert({
      where: { userId },
      create: {
        userId,
        email1DaysAfterDue: 3,
        email2DaysAfterDue: 10,
        email3DaysAfterDue: 21,
      },
      update: {},
    }),
  ])
}
