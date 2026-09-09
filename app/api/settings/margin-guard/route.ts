import { NextResponse } from "next/server"

export { GET, PUT } from "@/app/api/margin-guard/settings/route"

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
