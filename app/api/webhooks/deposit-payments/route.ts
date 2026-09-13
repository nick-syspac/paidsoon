import { NextResponse } from "next/server"
import { z } from "zod"

import { processDepositPaymentWebhook } from "@/lib/depositGuard/payments/webhooks"

const providerSchema = z.enum(["manual_external_link", "stripe_connect"])

export async function POST(request: Request) {
  const url = new URL(request.url)
  const parseResult = providerSchema.safeParse(
    url.searchParams.get("provider") ?? "stripe_connect",
  )

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
  }

  const provider = parseResult.data
  const payload = await request.text()
  const signature =
    provider === "stripe_connect"
      ? request.headers.get("stripe-signature")
      : null

  const result = await processDepositPaymentWebhook({
    provider,
    payload,
    signature,
  })

  return NextResponse.json(result.body, { status: result.status })
}
