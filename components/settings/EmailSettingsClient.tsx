"use client"

import { useState } from "react"

interface EmailSettingsData {
  fromEmail: string | null
  fromName: string | null
  replyTo: string | null
  resendVerified: boolean
}

export function EmailSettingsClient({
  canUseCustomReplyTo,
  canUseCustomSenderName,
  canUseVerifiedDomain,
  settings,
  systemEmail,
}: {
  canUseCustomReplyTo: boolean
  canUseCustomSenderName: boolean
  canUseVerifiedDomain: boolean
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
      body: JSON.stringify({
        fromEmail: fromEmail || systemEmail,
        fromName: fromName || "PaidSoon",
        replyTo: replyTo || undefined,
      }),
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

      {!canUseCustomReplyTo ? (
        <div className="space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
            Upgrade to Solo or Small Business to set a custom reply-to address.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reply-to (optional)
            </label>
            <input
              type="email"
              value={replyTo}
              readOnly
              disabled
              placeholder="replies@yourcompany.com"
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">Available on Solo and Small Business plans.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <p className="text-sm text-gray-500">
            {canUseVerifiedDomain
              ? "Set a custom from-address."
              : canUseCustomSenderName
                ? "Set a custom sender name and reply-to. Upgrade to Small Business for a verified custom from-address."
                : "Set a reply-to address. Upgrade to Solo or Small Business to customise the sender name and address."}
            {settings?.fromEmail && !settings.resendVerified && canUseVerifiedDomain && (
              <span className="text-amber-600 font-medium"> Verification pending for {settings.fromEmail}.</span>
            )}
            {settings?.resendVerified && canUseVerifiedDomain && (
              <span className="text-green-600 font-medium"> ✓ {settings.fromEmail} verified.</span>
            )}
          </p>

          {canUseVerifiedDomain && (
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
              <p className="text-xs text-gray-400 mt-1">Use a dedicated address like collections@yourcompany.com. We&apos;ll send a verification link when you save.</p>
            </div>
          )}

          {(canUseCustomSenderName || canUseVerifiedDomain) && (
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
              <p className="text-xs text-gray-400 mt-1">Your business name as it appears to clients — e.g. &quot;Acme Ltd&quot; or &quot;Acme Consulting&quot;.</p>
            </div>
          )}

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
            <p className="text-xs text-gray-400 mt-1">Optional. Client replies land here instead of your From address.</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && (
            <p className="text-sm text-green-600">
              {canUseVerifiedDomain ? "Saved! Check your inbox for a verification email." : "Saved!"}
            </p>
          )}

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
