"use client"

import { useState, useEffect } from "react"

function computeRemaining(expiresAtIso: string): number {
  return Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 60000))
}

export function AdminSessionTimer({ expiresAtIso }: { expiresAtIso: string }) {
  const [remaining, setRemaining] = useState(() => computeRemaining(expiresAtIso))

  useEffect(() => {
    const id = setInterval(() => setRemaining(computeRemaining(expiresAtIso)), 30_000)
    return () => clearInterval(id)
  }, [expiresAtIso])

  return <>{remaining}m remaining</>
}
