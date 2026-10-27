import { createUserProfile } from "@/lib/actions/auth"
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

function toPolicyRow(profile: {
  accountDisplayFromDate?: Date | string | null
  accountDisplayRevision?: number | null
  accountDisplayTimeZone?: string | null
} | null) {
  return {
    displayFromDate: normalizeDate(profile?.accountDisplayFromDate ?? null),
    revision: profile?.accountDisplayRevision ?? 0,
    timeZone: profile?.accountDisplayTimeZone ?? ACCOUNT_DISPLAY_TIME_ZONE,
  }
}

async function readProfile(userId: string) {
  const profile = await withUserContext(userId, (tx) =>
    tx.userProfile.findUnique({
      where: { userId },
      select: {
        userId: true,
        accountDisplayFromDate: true,
        accountDisplayRevision: true,
        accountDisplayTimeZone: true,
      },
    }),
  )

  if (!profile) {
    await createUserProfile(userId)
    return withUserContext(userId, (tx) =>
      tx.userProfile.findUnique({
        where: { userId },
        select: {
          userId: true,
          accountDisplayFromDate: true,
          accountDisplayRevision: true,
          accountDisplayTimeZone: true,
        },
      }),
    )
  }

  return profile
}

export async function GET(): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const profile = await readProfile(user.id)
    return NextResponse.json(toPolicyRow(profile))
  } catch (error) {
    console.error("[GET /api/settings/account] Failed to load account display policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: Request): Promise<Response> {
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
    const profile = await readProfile(user.id)
    const current = toPolicyRow(profile)

    if (parsed.data.expectedRevision !== current.revision) {
      return NextResponse.json({ error: "Revision conflict" }, { status: 409 })
    }

    if (parsed.data.displayFromDate === current.displayFromDate) {
      return NextResponse.json(current)
    }

    const nextRevision = current.revision + 1
    const updated = await withUserContext(user.id, (tx) =>
      tx.userProfile.update({
        where: { userId: user.id },
        data: {
          accountDisplayFromDate: parsed.data.displayFromDate ? new Date(`${parsed.data.displayFromDate}T00:00:00.000Z`) : null,
          accountDisplayRevision: nextRevision,
          accountDisplayTimeZone: ACCOUNT_DISPLAY_TIME_ZONE,
        },
        select: {
          accountDisplayFromDate: true,
          accountDisplayRevision: true,
          accountDisplayTimeZone: true,
        },
      }),
    )

    return NextResponse.json({
      displayFromDate: normalizeDate(updated.accountDisplayFromDate),
      revision: updated.accountDisplayRevision,
      timeZone: updated.accountDisplayTimeZone ?? ACCOUNT_DISPLAY_TIME_ZONE,
    })
  } catch (error) {
    console.error("[PATCH /api/settings/account] Failed to update account display policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
