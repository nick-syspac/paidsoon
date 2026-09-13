import { ModulePage, moduleMetadata } from "@/components/marketing/ModulePage"

export const metadata = {
  ...moduleMetadata("paidsoon"),
  alternates: { canonical: "/invoiceguard" },
  openGraph: {
    ...moduleMetadata("paidsoon").openGraph,
    url: "/invoiceguard",
  },
}

export default function InvoiceGuardModulePage() {
  return <ModulePage id="paidsoon" />
}
