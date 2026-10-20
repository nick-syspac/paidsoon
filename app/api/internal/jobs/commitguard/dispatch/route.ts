import { NextResponse } from "next/server"
import { isCommitGuardInternalJob } from "@/lib/commitguard/internalJobAuth"
import { CommitGuardScanSchema, scanCommitGuardWork } from "@/lib/commitguard/workScan"

/** Existing Railway owner only. No cron/trigger/authorization activation. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isCommitGuardInternalJob(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = CommitGuardScanSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  try {
    return NextResponse.json(await scanCommitGuardWork(parsed.data))
  } catch {
    console.error("[commitguard] dispatch_scan_failed")
    return NextResponse.json({ status: "failed", reason: "dispatch_scan_failed" }, { status: 500 })
  }
}