import { customerBillingOperationRoute, type BillingOperationRouteContext } from "@/lib/billing/customerBillingOperationRoute"
import type { NextResponse } from "next/server"

export async function POST(request: Request, context: BillingOperationRouteContext): Promise<NextResponse> {
  return customerBillingOperationRoute(request, context, true)
}