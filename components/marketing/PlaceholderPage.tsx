interface PlaceholderPageProps {
  title: string
  description: string
  children?: React.ReactNode
}

export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 mb-10 text-sm text-amber-800">
          <strong>Coming soon</strong> — this page is a placeholder. Content is being prepared.
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-4">{title}</h1>
        <p className="text-lg text-gray-500">{description}</p>

        {children && <div className="mt-10">{children}</div>}
      </div>
    </div>
  )
}
