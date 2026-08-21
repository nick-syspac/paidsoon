"use client"

import { useState } from "react"
import Link from "next/link"
import { Spinner } from "@/components/ui/Spinner"
import { requestPasswordReset } from "@/lib/auth/passwordReset"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    await requestPasswordReset(email, `${window.location.origin}/reset-password`)

    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-gray-600">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent
            a link to reset your password.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold mb-2">Forgot password?</h1>
        <p className="text-gray-500 mb-6 text-sm">
          Enter your email and we&apos;ll send you a link to reset your
          password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-md py-2 px-4 text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner />
                Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>

        <p className="text-sm text-gray-500 mt-4 text-center">
          Remembered your password?{" "}
          <Link href="/sign-in" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
