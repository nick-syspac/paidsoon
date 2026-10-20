import { NextResponse } from "next/server"
import { CommitGuardJobSchema } from "@/lib/commitguard/jobClaim"
import { dispatchCommitGuardJob } from "@/lib/commitguard/jobDispatch"
import { isCommitGuardInternalJob } from "@/lib/commitguard/internalJobAuth"

/** System-only identity admission, not user-session authority. Financial work
 * uses the tenant/fence boundary; this route never receives a privileged tx. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isCommitGuardInternalJob(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const parsed = CommitGuardJobSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  try {
    const result = await dispatchCommitGuardJob(parsed.data)
    return NextResponse.json(result)
  } catch {
    // Never log thrown DB/provider errors: they may contain tenant identities,
    // financial values or source payloads. Only this fixed code is diagnostic.
    console.error("[commitguard] internal_job_failed")
    return NextResponse.json({ status: "failed", reason: "internal_job_failed" }, { status: 500 })
  }
}