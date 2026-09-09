import { prismaAdmin } from "@/lib/db/admin"
import {
  buildRunwaySnapshotRecord,
  calculateRunwayTrend,
  type RunwaySummary,
} from "@/lib/runwayGuard/foundation"

export interface RunwaySnapshotRecordLike {
  id?: string
  userId: string
  snapshotAt: Date
  runwayDays: number
  usableCashCents: number
  projectedExhaustionDay?: number
  status?: string
  confidence?: number
  assumptions?: Record<string, unknown>
  reasons?: string[]
  explainability?: string[]
}

export interface RunwaySnapshotClient {
  runwayGuardSetting: {
    findMany(args: {
      where?: { enabled?: boolean }
      select?: { userId: true }
      take?: number
    }): Promise<Array<{ userId: string }>>
  }
  runwayGuardSnapshot: {
    findMany(args: {
      where?: { userId?: string }
      orderBy?: { snapshotAt: "asc" | "desc" }
      select?: { snapshotAt: true; runwayDays: true }
      take?: number
    }): Promise<Array<{ snapshotAt: Date; runwayDays: number }>>
    upsert(args: {
      where: { userId_snapshotAt: { userId: string; snapshotAt: Date } }
      update: Partial<RunwaySnapshotRecordLike>
      create: RunwaySnapshotRecordLike
    }): Promise<RunwaySnapshotRecordLike>
  }
}

export interface RunwaySnapshotSweepOptions {
  prisma?: RunwaySnapshotClient
  buildSummary?: (userId: string, now: Date) => Promise<RunwaySummary> | RunwaySummary
  limitUsers?: number
  now?: Date
}

export interface RunwayHistoryTrendOptions {
  userId: string
  prisma?: Pick<RunwaySnapshotClient, "runwayGuardSnapshot">
  limit?: number
}

export async function runRunwaySnapshotSweep(options: RunwaySnapshotSweepOptions = {}) {
  const prisma = options.prisma ?? (prismaAdmin as unknown as RunwaySnapshotClient)
  const startedAt = options.now ?? new Date()
  const settings = await prisma.runwayGuardSetting.findMany({
    where: { enabled: true },
    select: { userId: true },
    take: options.limitUsers,
  })

  let upserted = 0
  let failed = 0

  for (const setting of settings) {
    try {
      const buildSummary = options.buildSummary ?? (async (): Promise<RunwaySummary> => ({
        usableCashCents: 0,
        runwayDays: 0,
        projectedExhaustionDay: 0,
        status: "watch",
        source: "estimate",
        confidence: 0.5,
        reasons: ["No runway estimate was available at snapshot time."],
        explainability: ["Runway snapshot sweep captured a zero-value fallback placeholder."],
      }))
      const summary = await buildSummary(setting.userId, startedAt)
      const snapshot = buildRunwaySnapshotRecord({ userId: setting.userId, summary, snapshotAt: startedAt })

      await prisma.runwayGuardSnapshot.upsert({
        where: {
          userId_snapshotAt: {
            userId: setting.userId,
            snapshotAt: snapshot.snapshotAt,
          },
        },
        update: {
          usableCashCents: snapshot.usableCashCents,
          runwayDays: snapshot.runwayDays,
          projectedExhaustionDay: snapshot.projectedExhaustionDay,
          status: snapshot.status,
          confidence: snapshot.confidence,
          assumptions: snapshot.assumptions,
          explainability: snapshot.explainability,
        },
        create: {
          userId: snapshot.userId,
          snapshotAt: snapshot.snapshotAt,
          usableCashCents: snapshot.usableCashCents,
          runwayDays: snapshot.runwayDays,
          projectedExhaustionDay: snapshot.projectedExhaustionDay,
          status: snapshot.status,
          confidence: snapshot.confidence,
          assumptions: snapshot.assumptions,
          explainability: snapshot.explainability,
        },
      })

      upserted += 1
    } catch (error) {
      failed += 1
      console.error("[RunwayGuard Snapshot Sweep] Failed for user", setting.userId, error)
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    processedUsers: settings.length,
    upserted,
    failed,
  }
}

export async function getRunwayHistoryTrend(options: RunwayHistoryTrendOptions) {
  const prisma = options.prisma ?? (prismaAdmin as unknown as Pick<RunwaySnapshotClient, "runwayGuardSnapshot">)
  const rows = await prisma.runwayGuardSnapshot.findMany({
    where: { userId: options.userId },
    orderBy: { snapshotAt: "asc" },
    select: { snapshotAt: true, runwayDays: true },
    take: options.limit ?? 30,
  })

  return calculateRunwayTrend(
    rows.map((row: { snapshotAt: Date; runwayDays: number }) => ({
      snapshotAt: new Date(row.snapshotAt),
      runwayDays: Number(row.runwayDays),
    })),
  )
}
