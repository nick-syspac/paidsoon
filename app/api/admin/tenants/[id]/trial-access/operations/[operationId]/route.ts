import type { NextRequest, NextResponse } from "next/server"
import { trialAccessRoute, type TrialAccessRouteContext } from "@/lib/admin/trialAccessRoute"

export async function GET(request: NextRequest, context: TrialAccessRouteContext): Promise<NextResponse> {
  return trialAccessRoute(request, context, "status")
}