import { NextResponse } from "next/server"
import { AdminGuardError } from "@/lib/admin/guard"
import { CommitGuardRetrySchema, retryCommitGuardWork } from "@/lib/commitguard/workLifecycle"

/** No tenant write authority is created. The service requires elevated admin,
 * then changes ONLY failed work metadata with compare-generation semantics. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params
  const body: unknown = await request.json().catch(() => null)
  const parsed = CommitGuardRetrySchema.omit({ userId: true }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const input = CommitGuardRetrySchema.safeParse({ ...parsed.data, userId: id })
  if (!input.success) return NextResponse.json({ error: "Invalid tenant" }, { status: 400 })
  try {
    const retried = await retryCommitGuardWork(input.data)
    return NextResponse.json({ status: retried ? "pending" : "not_retryable" }, { status: retried ? 200 : 409 })
  } catch (error) {
    if (error instanceof AdminGuardError) return NextResponse.json({ error: "Unauthorized" }, {
      status: error.code === "unauthenticated" || error.code === "elevation_required" ? 401 : 403,
    })
    console.error("[commitguard] retry_failed")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}