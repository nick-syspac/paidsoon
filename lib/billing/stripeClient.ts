import Stripe from "stripe"

export function createStripeClient(options: { maxNetworkRetries?: number } = {}): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-05-27.dahlia",
    ...options,
  })
}
