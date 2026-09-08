import { NextResponse } from "next/server"

import { requireFeature } from "@/lib/billing"
import { detectCommitmentCandidates, listDetectedCommitmentCandidates } from "@/lib/commitguard/detection"
import { createClient } from "@/lib/supabase/server"

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [hasCoreFeature, hasDetectionFeature] = await Promise.all([
    requireFeature(user.id, "commitguard_core"),
    requireFeature(user.id, "commitguard_detection"),
  ])

  if (!hasCoreFeature || !hasDetectionFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const candidates = await listDetectedCommitmentCandidates(user.id)
    return NextResponse.json({ candidates })
  } catch (error) {
    console.error("[GET /api/commitguard/detections] Failed to list detected commitments", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [hasCoreFeature, hasDetectionFeature] = await Promise.all([
    requireFeature(user.id, "commitguard_core"),
    requireFeature(user.id, "commitguard_detection"),
  ])

  if (!hasCoreFeature || !hasDetectionFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const detection = await detectCommitmentCandidates(user.id)
    const candidates = await listDetectedCommitmentCandidates(user.id)
    return NextResponse.json({ detection, candidates })
  } catch (error) {
    if (error instanceof Error && error.message === "Upgrade required") {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    console.error("[POST /api/commitguard/detections] Failed to detect commitments", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
