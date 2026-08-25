import Stripe from "stripe"

export async function retrieveSubscriptionWithLatestInvoice(
  stripe: Stripe,
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice"],
  })
}

export async function listCustomerSubscriptions(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.ApiList<Stripe.Subscription>> {
  return stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  })
}

export async function createSubscriptionCancellationPortalSession(
  stripe: Stripe,
  params: Stripe.BillingPortal.SessionCreateParams,
): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create(params)
}