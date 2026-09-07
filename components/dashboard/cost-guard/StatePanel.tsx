type Variant = "info" | "success" | "warning" | "error"

export function StatePanel({
  variant = "info",
  title,
  description,
  actionLabel,
  actionHref,
}: {
  variant?: Variant
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
}) {
  const styles: Record<Variant, { container: string; title: string; accent: string }> = {
    info: {
      container: "border-blue-200 bg-blue-50",
      title: "text-blue-900",
      accent: "text-blue-700",
    },
    success: {
      container: "border-emerald-200 bg-emerald-50",
      title: "text-emerald-900",
      accent: "text-emerald-700",
    },
    warning: {
      container: "border-amber-200 bg-amber-50",
      title: "text-amber-900",
      accent: "text-amber-700",
    },
    error: {
      container: "border-red-200 bg-red-50",
      title: "text-red-900",
      accent: "text-red-700",
    },
  }

  const classes = styles[variant]

  return (
    <div className={`rounded-xl border p-4 ${classes.container}`}>
      <p className={`text-xs uppercase tracking-wide ${classes.accent}`}>Cost Guard status</p>
      <h3 className={`mt-2 text-base font-semibold ${classes.title}`}>{title}</h3>
      <p className="mt-2 text-sm text-gray-700">{description}</p>
      {actionLabel && actionHref ? (
        <a href={actionHref} className={`mt-3 inline-flex rounded-md px-3 py-2 text-sm font-medium text-white ${variant === "error" ? "bg-red-700 hover:bg-red-800" : "bg-blue-700 hover:bg-blue-800"}`}>
          {actionLabel}
        </a>
      ) : null}
    </div>
  )
}
