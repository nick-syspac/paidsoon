import { NextResponse } from "next/server"
import { z } from "zod"

import { issueDepositRequestPublicLink, toRequestAccessError } from "@/lib/depositGuard/requests"
import { createClient } from "@/lib/supabase/server"

const paramsSchema = z.object({ requestId: z.string().trim().min(1) })

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedParams = paramsSchema.safeParse(await context.params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  try {
    const origin = new URL(request.url).origin
    const result = await issueDepositRequestPublicLink(
      user.id,
      parsedParams.data.requestId,
      origin,
      user.id,
    )

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({
      requestId: result.requestId,
      publicUrl: result.url,
      token: result.token,
      tokenExpiresAt: result.expiresAt,
    })
  } catch (error) {
    const accessError = toRequestAccessError(error)
    if (accessError) {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error(
      "[POST /api/deposit-guard/requests/[requestId]/payment-link] Failed to issue public link",
      error,
    )
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
