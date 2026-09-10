"use client"

import { useState } from "react"
import { Turnstile } from "@marsidev/react-turnstile"

const enquiryTypes = ["Sales", "Support", "Accounting Partnerships"] as const
const accountingSystems = ["Xero", "MYOB", "CSV", "Other"] as const
const biggestProblems = ["Getting paid", "Waste", "Costs", "Margins", "Cash planning"] as const

type FormState = "idle" | "submitting" | "success" | "error"

export function ContactForm() {
  const [formState, setFormState] = useState<FormState>("idle")
  const [cfToken, setCfToken] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    businessName: "",
    accountingSystem: accountingSystems[0] as string,
    biggestProblem: biggestProblems[0] as string,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormState("submitting")

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          enquiryType: enquiryTypes[0],
          message: [
            `Business name: ${formData.businessName}`,
            `Accounting system: ${formData.accountingSystem}`,
            `Biggest problem: ${formData.biggestProblem}`,
            "Request type: Early access",
          ].join("\n"),
          cfToken,
        }),
      })

      if (res.ok) {
        setFormState("success")
      } else {
        setFormState("error")
        setCfToken(null)
      }
    } catch {
      setFormState("error")
      setCfToken(null)
    }
  }

  if (formState === "success") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <p className="font-semibold text-green-800 mb-2">Message received!</p>
        <p className="text-sm text-green-700">We&apos;ll get back to you within one business day.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Your name
        </label>
        <input
          id="name"
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Business email
        </label>
        <input
          id="email"
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">
          Business name
        </label>
        <input
          id="businessName"
          type="text"
          required
          value={formData.businessName}
          onChange={(e) => setFormData((d) => ({ ...d, businessName: e.target.value }))}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="accountingSystem" className="block text-sm font-medium text-gray-700 mb-1">
          Accounting system
        </label>
        <select
          id="accountingSystem"
          value={formData.accountingSystem}
          onChange={(e) => setFormData((d) => ({ ...d, accountingSystem: e.target.value }))}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {accountingSystems.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="biggestProblem" className="block text-sm font-medium text-gray-700 mb-1">
          Biggest problem
        </label>
        <select
          id="biggestProblem"
          value={formData.biggestProblem}
          onChange={(e) => setFormData((d) => ({ ...d, biggestProblem: e.target.value }))}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {biggestProblems.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {formState === "error" && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800">
          We could not send your message right now. Please email us directly at{" "}
          <a href="mailto:support@paidsoon.com.au" className="underline font-medium">
            support@paidsoon.com.au
          </a>
        </div>
      )}

      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
        options={{ size: "normal" }}
        onSuccess={setCfToken}
        onExpire={() => setCfToken(null)}
        onError={() => setCfToken(null)}
      />

      <button
        type="submit"
        disabled={formState === "submitting" || cfToken === null}
        className="w-full bg-blue-600 text-white py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {formState === "submitting" ? "Sending…" : "Send message"}
      </button>

      <p className="text-xs text-center text-gray-400">
        We&apos;ll help you identify the best starting module.
      </p>

      <p className="text-xs text-center text-gray-400">
        For urgent queries, email{" "}
        <a href="mailto:support@paidsoon.com.au" className="underline">
          support@paidsoon.com.au
        </a>{" "}
        directly.
      </p>
    </form>
  )
}
