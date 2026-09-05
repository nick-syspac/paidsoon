import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"

const ActionSchema = z.object({
  action: z.enum(["keep", "cancel", "renegotiate", "ignore", "reopen"]),
  note: z.string().trim().max(500).optional(),
})

type Params = { params: Promise<{ id: string }> }

function nextStateForAction(action: z.infer<typeof ActionSchema>["action"]): "open" | "resolved" | "dismissed" {
  if (action === "cancel" || action === "renegotiate") return "resolved"
  if (action === "keep" || action === "ignore") return "dismissed"
  return "open"
}

function isTransitionAllowed(currentState: string, nextState: string): boolean {
  if (currentState === nextState) return true
  if (currentState === "open") return ["resolved", "dismissed"].includes(nextState)
  if (currentState === "snoozed") return ["open", "resolved", "dismissed"].includes(nextState)
  if (currentState === "resolved" || currentState === "dismissed") return nextState === "open"
  return false
}

function isActionAllowed(currentState: string, action: z.infer<typeof ActionSchema>["action"]): boolean {
  if (currentState === "resolved" || currentState === "dismissed") {
    return action === "reopen"
  }

  if (currentState === "open") {
    return action !== "reopen"
  }

  if (currentState === "snoozed") {
    return true
  }

  return false
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const finding = await withUserContext(user.id, (tx) =>
    tx.spendInsight.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        findingType: true,
        summary: true,
        severity: true,
        state: true,
        reviewAction: true,
        reviewActionAt: true,
        reviewActionBy: true,
        reviewNote: true,
        evidence: true,
        detectedAt: true,
        resolvedAt: true,
      },
    }),
  )

  if (!finding) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ finding })
}

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const nextState = nextStateForAction(parsed.data.action)

  const result = await withUserContext(user.id, async (tx) => {
    const existing = await tx.spendInsight.findFirst({
      where: { id, userId: user.id },
      select: { id: true, state: true },
    })
    if (!existing) return { status: 404 as const }
    if (!isActionAllowed(existing.state, parsed.data.action)) return { status: 422 as const }
    if (!isTransitionAllowed(existing.state, nextState)) return { status: 422 as const }

    const updated = await tx.spendInsight.update({
      where: { id: existing.id },
      data: {
        state: nextState,
        reviewAction: parsed.data.action === "reopen" ? null : parsed.data.action,
        reviewActionAt: parsed.data.action === "reopen" ? null : new Date(),
        reviewActionBy: parsed.data.action === "reopen" ? null : user.id,
        reviewNote: parsed.data.action === "reopen" ? null : parsed.data.note ?? null,
        resolvedAt: nextState === "resolved" ? new Date() : null,
      },
      select: {
        id: true,
        state: true,
        reviewAction: true,
        reviewActionAt: true,
        reviewActionBy: true,
        reviewNote: true,
        resolvedAt: true,
      },
    })

    return { status: 200 as const, finding: updated }
  })

  if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (result.status === 422) return NextResponse.json({ error: "Invalid state transition" }, { status: 422 })

  return NextResponse.json({ finding: result.finding })
}
