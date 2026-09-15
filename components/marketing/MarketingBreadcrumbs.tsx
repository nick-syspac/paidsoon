import Link from "next/link"

interface BreadcrumbItem {
  label: string
  href: string
}

export function MarketingBreadcrumbs({
  items,
}: {
  items: BreadcrumbItem[]
}) {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          {items.map((item, index) => {
            const isLast = index === items.length - 1

            return (
              <li key={item.href} className="flex items-center gap-2">
                {isLast ? (
                  <span aria-current="page" className="text-gray-700">
                    {item.label}
                  </span>
                ) : (
                  <Link href={item.href} className="hover:text-blue-700">
                    {item.label}
                  </Link>
                )}
                {!isLast ? <span>/</span> : null}
              </li>
            )
          })}
        </ol>
      </nav>
    </>
  )
}