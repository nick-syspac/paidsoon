"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Turnstile } from "@marsidev/react-turnstile"
import { Spinner } from "@/components/ui/Spinner"
import {
  createClientTraceState,
  persistClientTraceCookie,
  traceClientEvent,
  traceRequestHeaders,
  updateClientTraceStateFromResponse,
} from "@/lib/diagnostics/client"

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cfToken, setCfToken] = useState<string | null>(null)
  const [traceState, setTraceState] = useState(createClientTraceState)

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    traceClientEvent(traceState, {
      stage: "auth.sign_in.client_submit",
      operation: "submit_email_sign_in_form",
      subsystem: "auth",
      component: "app/(auth)/sign-in/page.tsx",
      event: "start",
      inputs: { emailPresent: Boolean(email), credentialProvided: Boolean(password), captchaProvided: Boolean(cfToken) },
    })

    const res = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...traceRequestHeaders(traceState) },
      body: JSON.stringify({ email, password, cfToken }),
    })
    const nextTraceState = updateClientTraceStateFromResponse(traceState, res)
    setTraceState(nextTraceState)

    setLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(
        typeof data?.error === "string"
          ? data.error
          : "Sign in failed. Please try again."
      )
      // Reset token so the widget can issue a fresh one
      setCfToken(null)
      traceClientEvent(nextTraceState, {
        level: "warn",
        stage: "auth.sign_in.client_response",
        operation: "handle_email_sign_in_failure",
        subsystem: "auth",
        component: "app/(auth)/sign-in/page.tsx",
        event: "failure",
        http: { method: "POST", route: "/api/auth/sign-in", status: res.status },
        outputs: { status: res.status, turnstileTokenReset: true },
      })
      return
    }

    traceClientEvent(nextTraceState, {
      stage: "auth.sign_in.client_navigation",
      operation: "navigate_to_dashboard",
      subsystem: "auth",
      component: "app/(auth)/sign-in/page.tsx",
      event: "decision",
      http: { method: "POST", route: "/api/auth/sign-in", status: res.status },
      navigation: { from: "/sign-in", to: "/dashboard", decision: "email_sign_in_success" },
    })
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold mb-2">Sign in</h1>
        <p className="text-gray-500 mb-6 text-sm">
          Welcome back to PaidSoon.
        </p>

        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-right mt-1">
              <Link
                href="/forgot-password"
                className="text-xs text-blue-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
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
            disabled={loading || cfToken === null}
            className="w-full bg-blue-600 text-white rounded-md py-2 px-4 text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Spinner />Signing in…</> : "Sign in"}
          </button>
        </form>

        <p className="text-sm text-gray-500 mt-4 text-center">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
