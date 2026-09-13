import { NextResponse } from "next/server"
import { z } from "zod"

import {
  getDepositGuardSettings,
  saveDepositGuardSettings,
} from "@/lib/depositGuard/settings"
import { createClient } from "@/lib/supabase/server"

const settingsSchema = z
  .object({
    autoReminderEnabled: z.boolean(),
    initialReminderOffsetDays: z.number().int().min(0).max(30),
    beforeDueOffsetDays: z.number().int().min(0).max(30),
    overdue3Enabled: z.boolean(),
    overdue7Enabled: z.boolean(),
    paymentProviderDefault: z.enum(["manual_external_link", "stripe_connect"]),
    requireDepositBeforeStart: z.boolean(),
    settingsJson: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .strict()

function mapKnownAccessError(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null
  if (error.message === "Upgrade required") {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }
  return null
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const settings = await getDepositGuardSettings(user.id)
    return NextResponse.json({ settings })
  } catch (error) {
    const accessError = mapKnownAccessError(error)
    if (accessError) return accessError

    console.error("[GET /api/deposit-guard/settings] Failed", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const settings = await saveDepositGuardSettings(user.id, parsed.data)
    return NextResponse.json({ settings })
  } catch (error) {
    const accessError = mapKnownAccessError(error)
    if (accessError) return accessError

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[PUT /api/deposit-guard/settings] Failed", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
