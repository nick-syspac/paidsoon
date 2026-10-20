import { NextResponse } from "next/server"
import { SubscriptionAccessError } from "@/lib/billing/accessGuard"
import { CashPlanNotFoundError } from "@/lib/cashplan/inputLoader"

export function cashPlanRouteError(error: unknown): NextResponse {
  if (error instanceof CashPlanNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (error instanceof SubscriptionAccessError) return NextResponse.json(error.result, { status: 403 })
  console.error("[cashplan] operation_failed")
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}