"use client"

import { useState } from "react"

interface EmailSettingsData {
  fromEmail: string | null
  fromName: string | null
  replyTo: string | null
  resendVerified: boolean
}

export function EmailSettingsClient({
  canUseOwnEmail,
  settings,
  systemEmail,
}: {
  canUseOwnEmail: boolean
  settings: EmailSettingsData | null
  systemEmail: string
}) {
  const [fromEmail, setFromEmail] = useState(settings?.fromEmail ?? "")
  const [fromName, setFromName] = useState(settings?.fromName ?? "")
  const [replyTo, setReplyTo] = useState(settings?.replyTo ?? "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch("/api/settings/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromEmail, fromName, replyTo: replyTo || undefined }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      const data = await res.json()
      setError(data.error ?? "Failed to save")
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-base font-medium text-gray-900">Email Settings</h2>

      <div className="border border-gray-200 rounded-md px-4 py-3 text-sm">
        <p className="font-medium text-gray-700 mb-0.5">System email (Starter plan)</p>
        <p className="text-gray-500">{systemEmail}</p>
        <p className="text-xs text-gray-400 mt-1">
          Starter plan follow-ups are sent from this address. Replies go to your account email.
        </p>
      </div>

      {!canUseOwnEmail ? (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
          Upgrade to Solo or Small Business to send follow-ups from your own email address.
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <p className="text-sm text-gray-500">
            Set a custom from-address. You&apos;ll need to verify the email before it&apos;s used.
            {settings?.fromEmail && !settings.resendVerified && (
              <span className="text-amber-600 font-medium"> Verification pending for {settings.fromEmail}.</span>
            )}
            {settings?.resendVerified && (
              <span className="text-green-600 font-medium"> ✓ {settings.fromEmail} verified.</span>
            )}
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From email</label>
            <input
              type="email"
              required
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From name</label>
            <input
              type="text"
              required
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Your Name"
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reply-to (optional)
            </label>
            <input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="replies@yourcompany.com"
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Saved! Check your inbox for a verification email.</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save email settings"}
          </button>
        </form>
      )}
    </div>
  )
}
