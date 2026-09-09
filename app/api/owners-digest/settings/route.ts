import { NextResponse } from "next/server"
import { z } from "zod"

import { requireOwnersDigestCoreAccess } from "@/lib/ownersDigest/entitlements"
import { loadOwnersDigestSettings, updateOwnersDigestSettings } from "@/lib/ownersDigest/service"
import { createClient } from "@/lib/supabase/server"

const updateSchema = z.object({
  enabled: z.boolean(),
  emailEnabled: z.boolean(),
  frequency: z.enum(["off", "daily", "weekly", "monthly"]),
  deliveryDay: z.string().min(1).max(20),
  deliveryTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1).max(100),
  includeNeedsAttention: z.boolean(),
  includeOpportunities: z.boolean(),
  includePositiveChanges: z.boolean(),
  includeKeyNumbers: z.boolean(),
  maxActionItems: z.number().int().min(1).max(10),
  minimumMaterialityCents: z.number().int().min(0),
  sendWhenEmpty: z.boolean(),
  recipientScope: z.enum(["owner_only", "all_authorized_users"]),
})

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireOwnersDigestCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const settings = await loadOwnersDigestSettings(user.id)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[GET /api/owners-digest/settings] Failed to load settings", error)
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

  try {
    await requireOwnersDigestCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const settings = await updateOwnersDigestSettings(user.id, parsed.data)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[PUT /api/owners-digest/settings] Failed to save settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
