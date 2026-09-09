import { NextResponse } from "next/server"
import { z } from "zod"

import { sendOwnersDigest } from "@/lib/email/sendOwnersDigest"

const bodySchema = z.object({
  userId: z.string().min(1),
})

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.INTERNAL_JOBS_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    const result = await sendOwnersDigest(parsed.data.userId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[POST /api/internal/jobs/send-owners-digest] Failed to send Owner's Digest", error)
    return NextResponse.json({ status: "failed", reason: "owners_digest_send_failed" }, { status: 500 })
  }
}
