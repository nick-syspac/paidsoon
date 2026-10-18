import { customerBillingMutationRoute } from "@/lib/billing/customerBillingMutationRoute"
import type { NextResponse } from "next/server"

export async function POST(request: Request): Promise<NextResponse> {
  return customerBillingMutationRoute(request, "checkout")
}
