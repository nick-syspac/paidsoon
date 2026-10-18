import type { NextRequest, NextResponse } from "next/server"
import { trialAccessRoute, type TrialAccessRouteContext } from "@/lib/admin/trialAccessRoute"

/** Compatibility URL only: confirms an original-session Stripe preview using
 * { operationId, expectedVersion }. Legacy days/reason/intent bodies are invalid.
 * All authority, audit, reservations and provider writes use the shared workflow.
 */
export async function POST(request: NextRequest, context: TrialAccessRouteContext): Promise<NextResponse> {
  return trialAccessRoute(request, context, "extend-stripe")
}
