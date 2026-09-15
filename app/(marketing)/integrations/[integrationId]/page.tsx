import type { Metadata } from "next"
import {
  getIntegrationPage,
  getIntegrationStaticParams,
  IntegrationLandingPage,
  integrationMetadata,
} from "@/components/marketing/IntegrationLandingPage"

export function generateStaticParams(): Array<{ integrationId: string }> {
  return getIntegrationStaticParams()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ integrationId: string }>
}): Promise<Metadata> {
  const { integrationId } = await params
  return integrationMetadata(getIntegrationPage(integrationId))
}

export default async function IntegrationPage({
  params,
}: {
  params: Promise<{ integrationId: string }>
}) {
  const { integrationId } = await params
  return <IntegrationLandingPage integration={getIntegrationPage(integrationId)} />
}