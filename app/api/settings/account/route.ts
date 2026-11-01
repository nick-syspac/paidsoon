import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { z } from "zod"

export const ACCOUNT_DISPLAY_TIME_ZONE = "Australia/Melbourne" as const

const accountPolicySchema = z.object({
  displayFromDate: z.union([z.null(), z.iso.date()]),
  expectedRevision: z.number().int().min(0).max(2_147_483_647),
}).strict()

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (typeof value === "string") return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

function toPolicyRow(setting: {
  displayFromDate?: Date | string | null
  display_from_date?: Date | string | null
  revision?: number | null
  timeZone?: string | null
  time_zone?: string | null
} | null) {
  const displayFromDate = setting?.displayFromDate ?? setting?.display_from_date ?? null
  return {
    displayFromDate: normalizeDate(displayFromDate),
    revision: setting?.revision ?? 0,
    timeZone: setting?.timeZone ?? setting?.time_zone ?? ACCOUNT_DISPLAY_TIME_ZONE,
  }
}

async function readSetting(userId: string) {
  return await withUserContext(userId, (tx) =>
    tx.accountDisplaySetting.findUnique({
      where: { userId },
      select: {
        userId: true,
        displayFromDate: true,
        revision: true,
        timeZone: true,
      },
    }),
  )
}

async function readLockedSetting(tx: {
  $queryRaw: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>
}, userId: string) {
  const rows = await tx.$queryRaw<Array<{
    user_id: string
    display_from_date: Date | string | null
    revision: number
    time_zone: string | null
  }>>`
    SELECT user_id, display_from_date, revision, time_zone
    FROM public.account_display_settings
    WHERE user_id = ${userId}
    FOR UPDATE
  `

  if (rows.length === 0) return null
  return rows[0]
}

function isUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false
  if (error.code === "P2002") return true
  if (error.code !== "P2010" || !("meta" in error) ||
    typeof error.meta !== "object" || error.meta === null) return false
  const meta = error.meta
  if ("code" in meta && meta.code === "23505") return true
  if (!("driverAdapterError" in meta) || typeof meta.driverAdapterError !== "object" ||
    meta.driverAdapterError === null || !("cause" in meta.driverAdapterError)) return false
  const cause = meta.driverAdapterError.cause
  return typeof cause === "object" && cause !== null &&
    "originalCode" in cause && cause.originalCode === "23505"
}

export const GET = withSubscriptionAccess(GETHandler)
async function GETHandler(): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const setting = await readSetting(user.id)
    return NextResponse.json(toPolicyRow(setting))
  } catch (error) {
    console.error("[GET /api/settings/account] Failed to load account display policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export const PATCH = withSubscriptionAccess(PATCHHandler)
async function PATCHHandler(request: Request): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = accountPolicySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await withUserContext(user.id, async (tx) => {
      const lockedRow = await readLockedSetting(tx, user.id)
      const current = toPolicyRow(lockedRow)

      if (parsed.data.expectedRevision !== current.revision) {
        return { conflict: true, payload: { error: "Revision conflict" }, status: 409 }
      }

      if (parsed.data.displayFromDate === current.displayFromDate) {
        return { conflict: false, payload: current }
      }

      if (lockedRow === null) {
        if (parsed.data.displayFromDate === null) {
          return { conflict: false, payload: current }
        }

        try {
          const inserted = await tx.$queryRaw<Array<{
            user_id: string
            display_from_date: string | null
            revision: number
            time_zone: string | null
          }>>`
            INSERT INTO public.account_display_settings
              (user_id, display_from_date, revision, time_zone, created_at, updated_at)
            VALUES (${user.id}, ${parsed.data.displayFromDate}, 1, ${ACCOUNT_DISPLAY_TIME_ZONE}, NOW(), NOW())
            ON CONFLICT (user_id) DO NOTHING
            RETURNING user_id, display_from_date, revision, time_zone
          `

          if (inserted.length > 0) {
            return {
              conflict: false,
              payload: toPolicyRow(inserted[0]),
            }
          }

          const retryRow = await readLockedSetting(tx, user.id)
          if (retryRow === null) {
            return { conflict: true, payload: { error: "Revision conflict" }, status: 409 }
          }

          const retryCurrent = toPolicyRow(retryRow)
          if (parsed.data.expectedRevision !== retryCurrent.revision) {
            return { conflict: true, payload: { error: "Revision conflict" }, status: 409 }
          }

          if (parsed.data.displayFromDate === retryCurrent.displayFromDate) {
            return { conflict: false, payload: retryCurrent }
          }

          const updated = await tx.accountDisplaySetting.update({
            where: { userId: user.id },
            data: {
              displayFromDate: parsed.data.displayFromDate ? new Date(`${parsed.data.displayFromDate}T00:00:00.000Z`) : null,
              revision: retryCurrent.revision + 1,
              timeZone: ACCOUNT_DISPLAY_TIME_ZONE,
            },
            select: {
              userId: true,
              displayFromDate: true,
              revision: true,
              timeZone: true,
            },
          })

          return {
            conflict: false,
            payload: toPolicyRow(updated),
          }
        } catch (error) {
          if (isUniqueConflict(error)) {
            return { conflict: true, payload: { error: "Revision conflict" }, status: 409 }
          }
          throw error
        }
      }

      const nextRevision = lockedRow.revision + 1
      const updated = await tx.accountDisplaySetting.update({
        where: { userId: user.id },
        data: {
          displayFromDate: parsed.data.displayFromDate ? new Date(`${parsed.data.displayFromDate}T00:00:00.000Z`) : null,
          revision: nextRevision,
          timeZone: ACCOUNT_DISPLAY_TIME_ZONE,
        },
        select: {
          userId: true,
          displayFromDate: true,
          revision: true,
          timeZone: true,
        },
      })

      return {
        conflict: false,
        payload: toPolicyRow(updated),
      }
    })

    if (result.conflict) {
      return NextResponse.json(result.payload, { status: result.status })
    }

    return NextResponse.json(result.payload)
  } catch (error) {
    console.error("[PATCH /api/settings/account] Failed to update account display policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
