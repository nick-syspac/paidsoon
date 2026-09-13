import type { Metadata } from "next"
import { createElement } from "react"
import { headers } from "next/headers"

import { DepositPaymentRequestView } from "./DepositPaymentRequestView"
import { getPublicDepositRequestView } from "@/lib/depositGuard/publicRequests"

export const metadata: Metadata = {
  title: "Deposit payment request",
  description: "Secure deposit payment request page.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export const dynamic = "force-dynamic"

export default async function DepositPaymentRequestPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const requestHeaders = await headers()
  const clientFingerprint = `${requestHeaders.get("x-forwarded-for") ?? "unknown"}|${requestHeaders.get("user-agent") ?? "unknown"}`
  const view = await getPublicDepositRequestView(token, { clientFingerprint })

  if (view.state === "unavailable") {
    return createElement("div", { className: "min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8" }, createElement("div", { className: "mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center" }, createElement("div", { className: "w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)]" }, createElement("div", { className: "mb-4 text-4xl", "aria-hidden": true }, "🔒"), createElement("h1", { className: "text-2xl font-semibold tracking-tight text-slate-950" }, "Payment link unavailable"), createElement("p", { className: "mt-3 text-sm leading-6 text-slate-600" }, "This payment link is no longer available. If you still need access, please contact the sender for a fresh link."))))
  }

  if (view.state === "paid") {
    return createElement("div", { className: "min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8" }, createElement("div", { className: "mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center" }, createElement("div", { className: "w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)]" }, createElement("div", { className: "mb-4 text-4xl", "aria-hidden": true }, "✅"), createElement("h1", { className: "text-2xl font-semibold tracking-tight text-slate-950" }, "Payment received"), createElement("p", { className: "mt-3 text-sm leading-6 text-slate-600" }, "This deposit request has already been settled. No further action is needed."))))
  }

  if (view.state === "expired") {
    return createElement("div", { className: "min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8" }, createElement("div", { className: "mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center" }, createElement("div", { className: "w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)]" }, createElement("div", { className: "mb-4 text-4xl", "aria-hidden": true }, "⌛"), createElement("h1", { className: "text-2xl font-semibold tracking-tight text-slate-950" }, "Link expired"), createElement("p", { className: "mt-3 text-sm leading-6 text-slate-600" }, "This payment link has expired. Please request a new deposit link from the sender."))))
  }

  if (view.state === "cancelled") {
    return createElement("div", { className: "min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8" }, createElement("div", { className: "mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center" }, createElement("div", { className: "w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)]" }, createElement("div", { className: "mb-4 text-4xl", "aria-hidden": true }, "⛔"), createElement("h1", { className: "text-2xl font-semibold tracking-tight text-slate-950" }, "Request cancelled"), createElement("p", { className: "mt-3 text-sm leading-6 text-slate-600" }, "This deposit request has been cancelled and can no longer be paid through this link."))))
  }

  return createElement(DepositPaymentRequestView, {
    amountCents: view.totalAmountCents,
    currency: view.currency,
    dueDate: view.dueDate,
    description: view.description,
    externalPaymentUrl: view.externalPaymentUrl,
    firstViewedAt: view.firstViewedAt,
    lastViewedAt: view.lastViewedAt,
  })
}