import { NextResponse } from "next/server"
import { z } from "zod"

import {
  cancelDepositRequest,
  resendDepositRequest,
  sendDepositRequest,
  toRequestAccessError,
  updateDepositRequestDueDate,
} from "@/lib/depositGuard/requests"
import { createClient } from "@/lib/supabase/server"

const paramsSchema = z.object({ requestId: z.string().trim().min(1) })

const patchSchema = z
  .object({
    dueDate: z.string().datetime(),
  })
  .strict()

const actionSchema = z
  .object({
    action: z.enum(["send", "resend", "cancel"]),
  })
  .strict()

export async function PATCH(
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

  const parsedBody = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 })
  }

  try {
    const updated = await updateDepositRequestDueDate(
      user.id,
      parsedParams.data.requestId,
      new Date(parsedBody.data.dueDate),
    )

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ request: updated })
  } catch (error) {
    const accessError = toRequestAccessError(error)
    if (accessError) {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[PATCH /api/deposit-guard/requests/[requestId]] Failed to update due date", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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

  const parsedBody = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 })
  }

  try {
    const requestId = parsedParams.data.requestId
    let updated = null

    if (parsedBody.data.action === "send") {
      updated = await sendDepositRequest(user.id, requestId, user.id)
    } else if (parsedBody.data.action === "resend") {
      updated = await resendDepositRequest(user.id, requestId, user.id)
    } else {
      updated = await cancelDepositRequest(user.id, requestId, user.id)
    }

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ request: updated })
  } catch (error) {
    const accessError = toRequestAccessError(error)
    if (accessError) {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[POST /api/deposit-guard/requests/[requestId]] Failed to process action", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
