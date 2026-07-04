import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { UpdateArrangementStatusSchema } from "@/lib/arrangements"

type Params = { params: Promise<{ id: string }> }

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  active: ["broken", "fulfilled", "expired", "cancelled"],
  broken: ["active", "fulfilled", "expired", "cancelled"],
  expired: ["active", "fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
}

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = UpdateArrangementStatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const result = await withUserContext(user.id, async (tx) => {
    const arrangement = await tx.arrangement.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true },
    })

    if (!arrangement) {
      return { ok: false as const, status: 404, error: "Not found" }
    }

    if (arrangement.status === parsed.data.status) {
      return {
        ok: true as const,
        arrangement: { id: arrangement.id, status: arrangement.status },
      }
    }

    const allowed = ALLOWED_TRANSITIONS[arrangement.status] ?? []
    if (!allowed.includes(parsed.data.status)) {
      return {
        ok: false as const,
        status: 422,
        error: `Cannot transition arrangement from ${arrangement.status} to ${parsed.data.status}`,
      }
    }

    const now = new Date()
    const updated = await tx.arrangement.update({
      where: { id: arrangement.id },
      data: {
        status: parsed.data.status,
        breachedAt: parsed.data.status === "broken" ? now : null,
        fulfilledAt: parsed.data.status === "fulfilled" ? now : null,
        expiresAt: parsed.data.status === "expired" ? now : undefined,
      },
      select: { id: true, status: true },
    })

    return { ok: true as const, arrangement: updated }
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ arrangement: result.arrangement })
}
