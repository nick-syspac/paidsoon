import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import {
  buildDepositGuardJobPreview,
  depositGuardJobPreviewSchema,
} from "@/lib/depositGuard/jobForms"

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = depositGuardJobPreviewSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const preview = buildDepositGuardJobPreview(parsed.data)
    return NextResponse.json({ preview })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[POST /api/deposit-guard/jobs/preview] Failed to build preview", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}