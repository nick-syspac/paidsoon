"use client"

interface ImpersonationBannerProps {
  tenantId: string
}

export function ImpersonationBanner({ tenantId }: ImpersonationBannerProps) {
  const handleEnd = async () => {
    await fetch("/api/admin/impersonation/end", { method: "POST" })
    window.location.reload()
  }

  return (
    <div className="bg-amber-500 text-amber-950 px-6 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <span className="font-semibold text-sm">
          ⚠ Impersonating tenant: {tenantId}
        </span>
        <button
          onClick={handleEnd}
          className="text-amber-900 hover:text-amber-950 text-sm font-medium underline"
        >
          End impersonation
        </button>
      </div>
    </div>
  )
}
