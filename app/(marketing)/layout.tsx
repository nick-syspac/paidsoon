import { MarketingNav } from "@/components/marketing/MarketingNav"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { isLiveMode } from "@/lib/liveMode"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <MarketingNav liveMode={isLiveMode()} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </>
  )
}
