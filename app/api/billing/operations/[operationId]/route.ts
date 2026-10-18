import { customerBillingOperationRoute, type BillingOperationRouteContext } from "@/lib/billing/customerBillingOperationRoute"
import type { NextResponse } from "next/server"

export async function GET(request: Request, context: BillingOperationRouteContext): Promise<NextResponse> {
  return customerBillingOperationRoute(request, context, false)
}