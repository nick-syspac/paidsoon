"use client"

import { useState } from "react"

interface DeviceEnrolFormProps {
  onSuccess: () => void
}

function DeviceEnrolForm({ onSuccess }: DeviceEnrolFormProps) {
  const [label, setLabel] = useState("")
  const [publicKey, setPublicKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, publicKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Enrolment failed")
        return
      }
      setLabel("")
      setPublicKey("")
      onSuccess()
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Enrol New Device</h2>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div>
        <label className="block text-sm text-gray-300 mb-1">Device Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. MacBook Pro 2024"
          required
          className="w-full bg-gray-800 border border-gray-700 text-white rounded px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-300 mb-1">SSH Public Key (ssh-ed25519 ...)</label>
        <textarea
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder="ssh-ed25519 AAAA..."
          required
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded px-3 py-2 text-sm font-mono"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
      >
        {loading ? "Enrolling..." : "Enrol Device"}
      </button>
    </form>
  )
}

export default function AdminDevicesPageClient({
  initialDevices,
}: {
  initialDevices: Array<{
    id: string
    label: string
    publicKeyFingerprint: string
    keyType: string
    status: string
    createdAt: Date
    lastVerifiedAt: Date | null
    revokedAt: Date | null
  }>
}) {
  const [devices, setDevices] = useState(initialDevices)
  const [revoking, setRevoking] = useState<string | null>(null)

  const reload = async () => {
    const res = await fetch("/api/admin/devices")
    const data = await res.json()
    if (res.ok) setDevices(data.devices)
  }

  const revoke = async (id: string) => {
    if (!confirm("Revoke this device? This will also revoke all active admin sessions for it.")) return
    setRevoking(id)
    await fetch(`/api/admin/devices/${id}/revoke`, { method: "POST" })
    await reload()
    setRevoking(null)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Admin Devices</h1>

      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Fingerprint</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Used</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b border-gray-800 last:border-0">
                <td className="px-4 py-3 text-gray-200">{d.label}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{d.publicKeyFingerprint}</td>
                <td className="px-4 py-3">
                  <span className={d.status === "active" ? "text-green-400" : "text-red-400"}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {d.lastVerifiedAt ? new Date(d.lastVerifiedAt).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-3">
                  {d.status === "active" && (
                    <button
                      onClick={() => revoke(d.id)}
                      disabled={revoking === d.id}
                      className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
                    >
                      {revoking === d.id ? "Revoking..." : "Revoke"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <DeviceEnrolForm onSuccess={reload} />
      </div>
    </div>
  )
}
