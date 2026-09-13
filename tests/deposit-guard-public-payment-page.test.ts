import assert from "node:assert/strict"
import { before, describe, mock, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

describe("DepositGuard public payment page", () => {
  before(async () => {
    await mock.module("next/headers", {
      exports: {
        headers: async () =>
          new Headers({
            "x-forwarded-for": "203.0.113.10",
            "user-agent": "PaidSoonTest/1.0",
          }),
      },
    })

    await mock.module("@/lib/depositGuard/publicRequests", {
      exports: {
        getPublicDepositRequestView: async (token: string) => {
          if (token === "paid") {
            return {
              id: "req_paid",
              state: "paid",
              amountCents: 1000,
              taxAmountCents: null,
              totalAmountCents: 1000,
              currency: "aud",
              dueDate: new Date("2026-10-01T00:00:00.000Z"),
              description: null,
              externalPaymentUrl: null,
              firstViewedAt: null,
              lastViewedAt: null,
              paidAt: new Date("2026-10-01T00:00:00.000Z"),
              cancelledAt: null,
              tokenExpiresAt: null,
            }
          }

          if (token === "active") {
            return {
              id: "req_active",
              state: "active",
              amountCents: 16500,
              taxAmountCents: 1500,
              totalAmountCents: 18000,
              currency: "aud",
              dueDate: new Date("2026-10-10T00:00:00.000Z"),
              description: "Deposit for project",
              externalPaymentUrl: "https://pay.example.test/request/active",
              firstViewedAt: new Date("2026-09-12T00:00:00.000Z"),
              lastViewedAt: new Date("2026-09-12T00:00:00.000Z"),
              paidAt: null,
              cancelledAt: null,
              tokenExpiresAt: null,
            }
          }

          return {
            id: "",
            state: "unavailable",
            amountCents: 0,
            taxAmountCents: null,
            totalAmountCents: 0,
            currency: "aud",
            dueDate: new Date("2026-09-12T00:00:00.000Z"),
            description: null,
            externalPaymentUrl: null,
            firstViewedAt: null,
            lastViewedAt: null,
            paidAt: null,
            cancelledAt: null,
            tokenExpiresAt: null,
          }
        },
      },
    })
  })

  test("renders the active payment state", async () => {
    const Page = (await import("@/app/pay/deposit/[token]/page")).default
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "active" }) }))

    assert.ok(html.includes("Review and pay your deposit"))
    assert.ok(html.includes("Continue to payment"))
    assert.ok(html.includes("$180.00"))
  })

  test("renders the paid state", async () => {
    const Page = (await import("@/app/pay/deposit/[token]/page")).default
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "paid" }) }))

    assert.ok(html.includes("Payment received"))
  })
})
