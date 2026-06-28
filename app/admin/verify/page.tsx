"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function AdminVerifyPage() {
  const router = useRouter()
  const [deviceId, setDeviceId] = useState("")
  const [signature, setSignature] = useState("")
  const [nonce, setNonce] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const requestChallenge = async () => {
    if (!deviceId.trim()) {
      setError("Device ID is required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to request challenge")
        return
      }
      setNonce(data.nonce)
      setChallengeId(data.challengeId)
    } finally {
      setLoading(false)
    }
  }

  const verifySignature = async () => {
    if (!challengeId || !signature.trim()) {
      setError("Signature is required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/challenges/${challengeId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, signature }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Verification failed")
        return
      }
      router.push("/admin/overview")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Verification</h1>
          <p className="text-gray-400 text-sm mt-1">
            Prove control of your registered SSH key to start an elevated admin session.
          </p>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {!nonce ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Device ID</label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="Your registered admin device ID"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={requestChallenge}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-md text-sm disabled:opacity-50"
            >
              {loading ? "Requesting..." : "Request Challenge"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Challenge Nonce</label>
              <div className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2">
                <code className="text-green-400 text-xs break-all">{nonce}</code>
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-md p-4">
              <p className="text-sm text-gray-300 mb-2 font-medium">Sign this nonce with your admin SSH key:</p>
              <code className="block text-xs text-yellow-300 whitespace-pre-wrap break-all">
                {`echo "${nonce}" | ssh-keygen -Y sign -f ~/.ssh/paidsoon_admin_ed25519 -n paidsoon-admin-auth`}
              </code>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Paste signature output
              </label>
              <textarea
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                rows={8}
                placeholder="-----BEGIN SSH SIGNATURE-----&#10;...&#10;-----END SSH SIGNATURE-----"
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={verifySignature}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-medium py-2 px-4 rounded-md text-sm disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & Start Session"}
            </button>

            <button
              onClick={() => { setNonce(null); setChallengeId(null); setSignature("") }}
              className="w-full text-gray-400 hover:text-gray-300 text-sm"
            >
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
